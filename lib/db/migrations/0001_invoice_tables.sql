-- Create Invoice table
CREATE TABLE `Invoice` (
  `id` text PRIMARY KEY NOT NULL,
  `customerName` text NOT NULL,
  `vendorName` text NOT NULL,
  `invoiceNumber` text NOT NULL,
  `invoiceDate` text NOT NULL,
  `dueDate` text,
  `amount` real NOT NULL,
  `filePath` text,
  `createdAt` integer NOT NULL
);

-- Create LineItem table
CREATE TABLE `LineItem` (
  `id` text PRIMARY KEY NOT NULL,
  `invoiceId` text NOT NULL,
  `description` text NOT NULL,
  `quantity` real,
  `unitPrice` real,
  `total` real NOT NULL,
  `createdAt` integer NOT NULL,
  FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`)
); 