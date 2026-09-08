/**
 * Book metadata lookup service.
 * Primary: Google Books API
 * Fallback: Open Library API
 */

import axios from 'axios';

const GOOGLE_BOOKS_API_KEY = process.env.GOOGLE_BOOKS_API_KEY;

/**
 * Search for book metadata by title and/or ISBN.
 * Returns an array of normalized results.
 */
export async function lookupMetadata({ title, isbn }) {
  let results = [];

  // Try Google Books API first
  try {
    results = await searchGoogleBooks({ title, isbn });
  } catch (err) {
    console.warn('Google Books API failed:', err.message);
  }

  // Fallback to Open Library if Google returns nothing
  if (results.length === 0) {
    try {
      results = await searchOpenLibrary({ title, isbn });
    } catch (err) {
      console.warn('Open Library API failed:', err.message);
    }
  }

  return results;
}

/**
 * Google Books API search.
 */
async function searchGoogleBooks({ title, isbn }) {
  let query = '';
  if (isbn) query = `isbn:${isbn}`;
  else if (title) query = `intitle:${title}`;
  else return [];

  const params = { q: query, maxResults: 10 };
  if (GOOGLE_BOOKS_API_KEY) params.key = GOOGLE_BOOKS_API_KEY;

  const { data } = await axios.get('https://www.googleapis.com/books/v1/volumes', { params });

  if (!data.items || data.items.length === 0) return [];

  return data.items.map((item) => {
    const info = item.volumeInfo || {};
    const isbn13 = info.industryIdentifiers?.find((id) => id.type === 'ISBN_13')?.identifier;
    const isbn10 = info.industryIdentifiers?.find((id) => id.type === 'ISBN_10')?.identifier;

    return {
      source: 'google_books',
      title: info.title || '',
      author: info.authors?.join(', ') || '',
      description: info.description || '',
      isbn: isbn13 || isbn10 || '',
      coverImageUrl: info.imageLinks?.thumbnail?.replace('http:', 'https:') || '',
      publisher: info.publisher || '',
      publishedDate: info.publishedDate || '',
      pageCount: info.pageCount || null,
      language: info.language || 'en',
      categories: info.categories || [],
    };
  });
}

/**
 * Open Library API search (fallback).
 */
async function searchOpenLibrary({ title, isbn }) {
  let url = '';
  if (isbn) {
    url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
    const { data } = await axios.get(url);
    const key = `ISBN:${isbn}`;
    if (!data[key]) return [];

    const book = data[key];
    return [
      {
        source: 'open_library',
        title: book.title || '',
        author: book.authors?.map((a) => a.name).join(', ') || '',
        description: book.notes || book.excerpts?.[0]?.text || '',
        isbn: isbn,
        coverImageUrl: book.cover?.medium || book.cover?.small || '',
        publisher: book.publishers?.[0]?.name || '',
        publishedDate: book.publish_date || '',
        pageCount: book.number_of_pages || null,
        language: '',
        categories: book.subjects?.map((s) => s.name).slice(0, 5) || [],
      },
    ];
  }

  if (title) {
    url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=10`;
    const { data } = await axios.get(url);

    if (!data.docs || data.docs.length === 0) return [];

    return data.docs.map((doc) => ({
      source: 'open_library',
      title: doc.title || '',
      author: doc.author_name?.join(', ') || '',
      description: doc.first_sentence?.join(' ') || '',
      isbn: doc.isbn?.[0] || '',
      coverImageUrl: doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : '',
      publisher: doc.publisher?.[0] || '',
      publishedDate: doc.first_publish_year?.toString() || '',
      pageCount: doc.number_of_pages_median || null,
      language: doc.language?.[0] || '',
      categories: doc.subject?.slice(0, 5) || [],
    }));
  }

  return [];
}
