import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceById, updateInvoice, deleteInvoiceById, deleteLineItemsByInvoiceId, saveLineItems } from '@/lib/db/queries';
import { auth } from '@/app/(auth)/auth';

// Utility function to ensure consistent date format
const formatDateForStorage = (dateString: string | null): string | null => {
  if (!dateString) return null;
  
  // If the date is already in ISO format, return it
  if (dateString.includes('T')) return dateString;
  
  // Otherwise, convert it to ISO format with UTC time
  try {
    // Parse the date in YYYY-MM-DD format
    const [year, month, day] = dateString.split('-').map(Number);
    // Create a UTC date
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toISOString();
  } catch (error) {
    console.error('Error formatting date:', error);
    return dateString;
  }
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    
    // Get invoice details
    const invoice = await getInvoiceById({ id });
    
    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(invoice);
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invoice' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const data = await request.json();
    
    // Update invoice with properly formatted dates
    await updateInvoice({
      id,
      customerName: data.customerName,
      vendorName: data.vendorName,
      invoiceNumber: data.invoiceNumber,
      invoiceDate: formatDateForStorage(data.invoiceDate),
      dueDate: formatDateForStorage(data.dueDate),
      amount: data.amount,
    });
    
    // Handle line items if they exist
    if (data.lineItems && Array.isArray(data.lineItems)) {
      // Delete existing line items
      await deleteLineItemsByInvoiceId({ invoiceId: id });
      
      // Add new line items
      if (data.lineItems.length > 0) {
        const lineItemsToSave = data.lineItems.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total
        }));
        
        await saveLineItems({
          invoiceId: id,
          items: lineItemsToSave
        });
      }
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating invoice:', error);
    return NextResponse.json(
      { error: 'Failed to update invoice' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = await params;
    
    // Delete invoice
    await deleteInvoiceById({ id });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return NextResponse.json(
      { error: 'Failed to delete invoice' },
      { status: 500 }
    );
  }
} 