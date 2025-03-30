// Script to clear all events from the database
const { Pool } = require('pg');

// Connect to database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function clearEvents() {
  try {
    // First, clear all upvotes as they have foreign key constraints
    console.log('Clearing upvotes table...');
    await pool.query('DELETE FROM upvotes');
    console.log('Upvotes table cleared successfully.');
    
    // Then clear all events
    console.log('Clearing events table...');
    await pool.query('DELETE FROM events');
    console.log('Events table cleared successfully.');
    
    console.log('Database cleared successfully!');
  } catch (error) {
    console.error('Error clearing database:', error);
  } finally {
    // Close the pool
    await pool.end();
  }
}

// Run the function
clearEvents()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });