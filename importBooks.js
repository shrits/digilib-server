import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { lookupMetadata } from './src/services/metadataLookup.js';

const prisma = new PrismaClient();

async function loginAndGetCookie() {
  const loginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@digilib.local', password: 'Admin@1234' }),
  });
  
  if (!loginRes.ok) {
    const errorText = await loginRes.text();
    throw new Error(`Login failed: ${loginRes.status} ${errorText}`);
  }
  
  const cookies = loginRes.headers.get('set-cookie');
  return cookies;
}

async function findFilesRecursively(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const res = path.resolve(dir, entry.name);
      return entry.isDirectory() ? findFilesRecursively(res) : res;
    })
  );
  return Array.prototype.concat(...files);
}

// Function to find or create genres and return their IDs
async function getOrCreateGenres(categories) {
  const genreIds = [];
  for (const category of categories) {
    // OpenLibrary returns complex strings sometimes, just take the first part
    let genreName = category.split(/[-–,]/)[0].trim();
    if (genreName.length > 50) genreName = genreName.substring(0, 50); // limit length
    
    // Capitalize properly
    genreName = genreName.charAt(0).toUpperCase() + genreName.slice(1).toLowerCase();
    
    if (genreName.length === 0) continue;

    const genre = await prisma.genre.upsert({
      where: { name: genreName },
      update: {},
      create: { name: genreName },
    });
    genreIds.push(genre.id);
  }
  return genreIds;
}

async function uploadBook(book, cookies) {
  const form = new FormData();
  form.append('title', book.title);
  form.append('author', book.author);
  
  if (book.description) form.append('description', book.description);
  if (book.publishedYear) form.append('publishedDate', book.publishedYear);
  if (book.publisher) form.append('publisher', book.publisher);
  if (book.genreIds && book.genreIds.length > 0) {
    form.append('genreIds', JSON.stringify(book.genreIds));
  } else {
    form.append('description', 'Imported from Documents (no metadata found)');
  }

  // Append PDF
  const pdfBuffer = await fs.readFile(book.pdfPath);
  const pdfBlob = new Blob([pdfBuffer], { type: 'application/pdf' });
  form.append('pdfFile', pdfBlob, path.basename(book.pdfPath));

  // Append Cover Image
  if (book.coverPath) {
    const coverBuffer = await fs.readFile(book.coverPath);
    const coverType = book.coverPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const coverBlob = new Blob([coverBuffer], { type: coverType });
    form.append('coverImage', coverBlob, path.basename(book.coverPath));
  } else if (book.coverImageUrl) {
    // If metadata returned a cover URL and we don't have a local one, API doesn't handle external URLs in form-data for coverImage right now,
    // so we'd have to download it. But to keep it simple, we just set the URL if the backend supported it, 
    // but the backend upload middleware expects a file. We'll skip downloading it for now to save time, unless the user requested it.
  }

  const res = await fetch('http://localhost:3001/api/books', {
    method: 'POST',
    headers: { 'Cookie': cookies },
    body: form,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to upload ${book.title}: ${res.status} ${errorText}`);
  }
  return res.json();
}

async function main() {
  // DB is not wiped so we can resume.
  // await prisma.bookGenre.deleteMany({});
  // await prisma.book.deleteMany({});
  console.log('Books wiped.');

  console.log('Logging in...');
  const cookies = await loginAndGetCookie();
  console.log('Login successful.');

  const baseDir = path.resolve(process.env.HOME, 'Documents');
  console.log(`Scanning ${baseDir}...`);
  
  const allFiles = await findFilesRecursively(baseDir);
  const pdfs = allFiles.filter(f => f.toLowerCase().endsWith('.pdf'));
  
  console.log(`Found ${pdfs.length} PDF books.`);
  
  let successCount = 0;
  
  for (const pdfPath of pdfs) {
    const relativePath = path.relative(baseDir, pdfPath);
    const parts = relativePath.split(path.sep);
    
    // Use top level folder as author
    let rawAuthor = parts[0]; 
    
    // Format author: "<SURNAME>, <NAME>" -> "<NAME> <SURNAME>"
    // Also strip out extra stuff like " - Nobel Prize..."
    let author = rawAuthor.split('-')[0].trim();
    if (author.includes(',')) {
      const p = author.split(',').map(s => s.trim());
      if (p.length === 2 && p[0] && p[1]) {
        author = `${p[1]} ${p[0]}`;
      }
    }
    
    // Clean up title
    let title = path.basename(pdfPath, '.pdf');
    // Remove author name if prepended: "Morrison, Toni - Beloved" -> "Beloved"
    if (title.startsWith(rawAuthor + ' - ')) {
      title = title.substring((rawAuthor + ' - ').length);
    } else if (title.includes(' - ')) {
      // General fallback: if there's a dash, we assume the latter part is the title, 
      // or if it's "Title - Author", we might get it wrong, but most files were "Author - Title".
      const tparts = title.split(' - ');
      title = tparts[tparts.length - 1].trim(); 
    }
    // Remove trailing brackets like (Knopf, 2003) or [tr. Garnett]
    title = title.replace(/\s*[\(\[].*?[\)\]]/g, '').trim();
    
    // Find local cover image
    const parsedDir = path.dirname(pdfPath);
    const baseName = path.basename(pdfPath, '.pdf');
    const potentialImages = [
      path.join(parsedDir, `${baseName}.jpg`),
      path.join(parsedDir, `${baseName}.jpeg`),
      path.join(parsedDir, `${baseName}.png`),
    ];
    
    let coverPath = null;
    for (const p of potentialImages) {
      try {
        await fs.access(p);
        coverPath = p;
        break;
      } catch (e) {}
    }
    if (!coverPath) {
      try {
        const dirFiles = await fs.readdir(parsedDir);
        const imageFile = dirFiles.find(f => f.toLowerCase().match(/\.(jpg|jpeg|png)$/));
        if (imageFile) coverPath = path.join(parsedDir, imageFile);
      } catch (e) {}
    }
    
    const existing = await prisma.book.findFirst({
      where: { title, author }
    });
    if (existing) {
      console.log(`Skipping already uploaded book: "${title}"`);
      continue;
    }

    // Lookup metadata for genres and description
    let genreIds = [];
    let description = '';
    let publisher = '';
    let publishedYear = '';
    
    console.log(`\nProcessing: "${title}" by ${author}`);
    try {
      const metadataResults = await lookupMetadata({ title });
      if (metadataResults && metadataResults.length > 0) {
        const topResult = metadataResults[0];
        if (topResult.categories && topResult.categories.length > 0) {
          genreIds = await getOrCreateGenres(topResult.categories);
        }
        description = topResult.description;
        publisher = topResult.publisher;
        publishedYear = topResult.publishedDate;
      }
    } catch (e) {
      console.warn(`Metadata lookup failed for ${title}:`, e.message);
    }
    
    const bookData = { 
      title, 
      author, 
      pdfPath, 
      coverPath,
      genreIds,
      description,
      publisher,
      publishedYear
    };
    
    try {
      await uploadBook(bookData, cookies);
      successCount++;
      console.log(`✅ Uploaded "${title}"`);
    } catch (e) {
      console.error(`❌ Failed:`, e.message);
    }
    
    // Slight delay to be nice to APIs
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\nFinished. Successfully imported ${successCount} out of ${pdfs.length} books.`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
