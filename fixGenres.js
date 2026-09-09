import { PrismaClient } from '@prisma/client';
import { lookupMetadata } from './src/services/metadataLookup.js';

const prisma = new PrismaClient();

async function getOrCreateGenres(genreNames) {
  const genreIds = [];
  for (const genreName of genreNames) {
    // Only accept reasonable length genres to avoid storing entire sentences
    if (!genreName || genreName.length > 50) continue;
    const genre = await prisma.genre.upsert({
      where: { name: genreName },
      update: {},
      create: { name: genreName },
    });
    genreIds.push(genre.id);
  }
  return genreIds;
}

async function main() {
  const books = await prisma.book.findMany({
    where: {
      genres: { none: {} } // Find books with no genres
    }
  });

  console.log(`Found ${books.length} books with no genres.`);
  let successCount = 0;

  for (const book of books) {
    console.log(`Processing: "${book.title}" by ${book.author}`);
    try {
      const metadataResults = await lookupMetadata({ title: book.title });
      
      let description = book.description;
      let publisher = book.publisher;
      let publishedYear = book.publishedDate;
      let genreIds = [];

      if (metadataResults && metadataResults.length > 0) {
        const topResult = metadataResults[0];
        
        if (topResult.categories && topResult.categories.length > 0) {
          genreIds = await getOrCreateGenres(topResult.categories);
        }
        
        if (topResult.description && (!description || description === 'Imported from Documents (no metadata found)')) {
          description = topResult.description;
        }
        if (topResult.publisher && !publisher) publisher = topResult.publisher;
        if (topResult.publishedDate && !publishedYear) publishedYear = topResult.publishedDate;
      }

      if (genreIds.length > 0 || description !== book.description) {
        await prisma.book.update({
          where: { id: book.id },
          data: {
            description,
            publisher,
            publishedDate: publishedYear,
            genres: genreIds.length > 0 ? {
              create: genreIds.map((genreId) => ({ genreId }))
            } : undefined
          }
        });
        successCount++;
        console.log(`✅ Updated metadata/genres for "${book.title}"`);
      } else {
        console.log(`⚠️ No metadata found for "${book.title}"`);
      }
    } catch (e) {
      console.error(`❌ Failed metadata lookup for "${book.title}":`, e.message);
    }
    
    // Generous delay of 1.2s to respect OpenLibrary 1req/sec limit and avoid Google Books limits
    await new Promise(r => setTimeout(r, 1200));
  }
  
  console.log(`\nFinished. Successfully updated ${successCount} out of ${books.length} books.`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
