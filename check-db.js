const Database = require('better-sqlite3');

// Open the database
const db = new Database('sqlite.db');

// Check if the tables exist and show their data
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables in the database:');
  tables.forEach(table => {
    console.log(`- ${table.name}`);
  });

  // Try to query the Invoice table
  try {
    const invoices = db.prepare('SELECT * FROM Invoice').all();
    console.log('\n=== Invoice Table Data ===');
    console.log('Number of invoices:', invoices.length);
    
    if (invoices.length > 0) {
      console.log('\nInvoice records:');
      invoices.forEach(invoice => {
        console.log(JSON.stringify(invoice, null, 2));
      });
    } else {
      console.log('No invoice records found.');
    }
  } catch (error) {
    console.error('\nError querying Invoice table:', error.message);
  }

  // Try to query the LineItem table
  try {
    const lineItems = db.prepare('SELECT * FROM LineItem').all();
    console.log('\n=== LineItem Table Data ===');
    console.log('Number of line items:', lineItems.length);
    
    if (lineItems.length > 0) {
      console.log('\nLineItem records:');
      lineItems.forEach(item => {
        console.log(JSON.stringify(item, null, 2));
      });
    } else {
      console.log('No line item records found.');
    }
  } catch (error) {
    console.error('\nError querying LineItem table:', error.message);
  }
} catch (error) {
  console.error('Error:', error.message);
} finally {
  // Close the database
  db.close();
} 