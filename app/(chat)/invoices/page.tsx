import { InvoicesTable } from '@/components/invoices-table';

export default function InvoicesPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Invoice Management</h1>
      <InvoicesTable />
    </div>
  );
} 