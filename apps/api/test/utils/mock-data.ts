/**
 * Lightweight mock data generator to replace faker
 * This avoids ESM module issues with @faker-js/faker in Jest
 */

let sequenceCounter = 1;

export const mockData = {
  // Reset sequence counter (useful for tests)
  reset: () => {
    sequenceCounter = 1;
  },

  // Generate sequential IDs
  id: (prefix = 'id') => `${prefix}_${sequenceCounter++}`,

  // Generate UUIDs (simplified version)
  uuid: () => {
    const timestamp = Date.now().toString(16);
    const random = Math.random().toString(16).substring(2, 10);
    return `${timestamp}-${random}-${sequenceCounter++}`;
  },

  // Generate names
  name: () => {
    const names = ['Acme Corp', 'TechStart', 'CloudBase', 'DataFlow', 'NextGen Solutions'];
    return names[Math.floor(Math.random() * names.length)] + ` ${sequenceCounter++}`;
  },

  // Generate company names
  company: () => mockData.name(),

  // Generate emails
  email: (name?: string) => {
    const username = name ? name.toLowerCase().replace(/\s+/g, '.') : `user${sequenceCounter}`;
    const domains = ['example.com', 'test.com', 'demo.com'];
    return `${username}@${domains[Math.floor(Math.random() * domains.length)]}`;
  },

  // Generate URLs
  url: (path = '') => `https://example.com${path}`,

  // Generate numbers
  number: (min = 1, max = 1000) => Math.floor(Math.random() * (max - min + 1)) + min,

  // Generate prices (in cents)
  price: (min = 100, max = 100000) => mockData.number(min, max),

  // Generate booleans
  boolean: () => Math.random() > 0.5,

  // Generate dates
  date: {
    past: (daysAgo = 30) => {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      return date.toISOString();
    },
    future: (daysAhead = 30) => {
      const date = new Date();
      date.setDate(date.getDate() + daysAhead);
      return date.toISOString();
    },
    recent: (hoursAgo = 24) => {
      const date = new Date();
      date.setHours(date.getHours() - hoursAgo);
      return date.toISOString();
    },
    now: () => new Date().toISOString(),
  },

  // Generate text/descriptions
  text: (words = 10) => {
    const wordList = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing',
                      'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore'];
    const result = [];
    for (let i = 0; i < words; i++) {
      result.push(wordList[Math.floor(Math.random() * wordList.length)]);
    }
    return result.join(' ');
  },

  // Generate slugs
  slug: (text?: string) => {
    const base = text || mockData.name();
    return base.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  },

  // Pick random item from array
  pickOne: <T>(items: T[]): T => {
    return items[Math.floor(Math.random() * items.length)];
  },

  // Pick multiple random items from array
  pickMany: <T>(items: T[], count: number): T[] => {
    const shuffled = [...items].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, items.length));
  },
};