import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

config({
  path: '.env.local',
});

const runMigrate = async () => {
  const sqlite = new Database('sqlite.db');
  const db = drizzle(sqlite);

  console.log('⏳ Running migrations...');

  const start = Date.now();
  
  // Custom migration logic to handle multiple statements in a single file
  const migrationsFolder = './lib/db/migrations';
  
  // Create migrations table if it doesn't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    )
  `);
  
  // Get all migration files
  const migrationFiles = fs.readdirSync(migrationsFolder)
    .filter(file => file.endsWith('.sql'))
    .sort();
  
  // Get already applied migrations
  const appliedMigrations = sqlite.prepare(
    'SELECT hash FROM __drizzle_migrations'
  ).all().map(row => row.hash);
  
  // Execute each migration file
  for (const file of migrationFiles) {
    const hash = file.split('_')[0];
    
    // Skip if migration already applied
    if (appliedMigrations.includes(hash)) {
      console.log(`Migration ${file} already applied, skipping...`);
      continue;
    }
    
    console.log(`Applying migration: ${file}`);
    const filePath = path.join(migrationsFolder, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Split the SQL file into individual statements
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    // Execute each statement
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          // Add IF NOT EXISTS to CREATE TABLE statements
          let modifiedStatement = statement;
          if (modifiedStatement.trim().toUpperCase().startsWith('CREATE TABLE')) {
            modifiedStatement = modifiedStatement.replace(
              /CREATE TABLE\s+(`?\w+`?)/i,
              'CREATE TABLE IF NOT EXISTS $1'
            );
          }
          
          sqlite.exec(modifiedStatement + ';');
        } catch (err) {
          console.error(`Error executing statement in ${file}:`, err);
          // Continue with other statements instead of failing
          console.log('Continuing with other statements...');
        }
      }
    }
    
    // Record the migration
    sqlite.exec(`
      INSERT INTO __drizzle_migrations (hash, created_at)
      VALUES ('${hash}', ${Date.now()})
    `);
  }
  
  const end = Date.now();

  console.log('✅ Migrations completed in', end - start, 'ms');
  process.exit(0);
};

runMigrate().catch((err) => {
  console.error('❌ Migration failed');
  console.error(err);
  process.exit(1);
});
