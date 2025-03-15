'use client';

import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Label } from '@/components/ui/label';
import React from 'react';

// Utility function to format dates consistently without timezone shifting
const formatDate = (dateString: string | null): string => {
  if (!dateString) return 'N/A';
  
  // Parse the date string and handle it in UTC
  const date = new Date(dateString);
  
  // Get the UTC year, month, and day
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // getUTCMonth() returns 0-11
  const day = date.getUTCDate();
  
  // Format as MM/DD/YYYY
  return `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`;
};

// Utility function to convert date to YYYY-MM-DD format for input[type="date"]
const toInputDateFormat = (dateString: string | null): string => {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const year = date.getUTCFullYear();
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = date.getUTCDate().toString().padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

type LineItem = {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  total: number;
  createdAt: string;
};

type Invoice = {
  id: string;
  customerName: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  amount: number;
  createdAt: string;
  lineItems?: LineItem[];
};

export function InvoicesTable() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [sortField, setSortField] = useState<keyof Invoice>('invoiceDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [showLineItems, setShowLineItems] = useState<Record<string, boolean>>({});
  const [editingLineItem, setEditingLineItem] = useState<LineItem | null>(null);
  const { toast } = useToast();
  
  useEffect(() => {
    fetchInvoices();
  }, []);
  
  const fetchInvoices = async () => {
    try {
      const response = await fetch('/api/invoices');
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched invoices:', data);
        setInvoices(data);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch invoices",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast({
        title: "Error",
        description: "Failed to fetch invoices",
        variant: "destructive"
      });
    }
  };
  
  const handleSort = (field: keyof Invoice) => {
    if (field === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    
    // Sort invoices
    const sortedInvoices = [...invoices].sort((a, b) => {
      const aValue = a[field];
      const bValue = b[field];
      
      if (aValue === null || aValue === undefined) return sortDirection === 'asc' ? -1 : 1;
      if (bValue === null || bValue === undefined) return sortDirection === 'asc' ? 1 : -1;
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    setInvoices(sortedInvoices);
  };
  
  const handleSaveEdit = async () => {
    if (!editingInvoice) return;
    
    try {
      // Prepare the invoice data for submission
      // We don't need to modify the dates here since the API will handle the formatting
      const invoiceData = {
        ...editingInvoice,
        // Make sure lineItems are properly formatted
        lineItems: editingInvoice.lineItems?.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total
        }))
      };
      
      const response = await fetch(`/api/invoices/${editingInvoice.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invoiceData),
      });
      
      if (response.ok) {
        toast({
          title: "Invoice updated",
          description: "The invoice has been successfully updated",
        });
        fetchInvoices();
        setEditingInvoice(null);
      } else {
        toast({
          title: "Update failed",
          description: "Failed to update the invoice",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error updating invoice:', error);
      toast({
        title: "Update failed",
        description: "Failed to update the invoice",
        variant: "destructive"
      });
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;
    
    try {
      const response = await fetch(`/api/invoices/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        toast({
          title: "Invoice deleted",
          description: "The invoice has been successfully deleted",
        });
        fetchInvoices();
      } else {
        toast({
          title: "Delete failed",
          description: "Failed to delete the invoice",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error deleting invoice:', error);
      toast({
        title: "Delete failed",
        description: "Failed to delete the invoice",
        variant: "destructive"
      });
    }
  };

  const toggleLineItems = (invoiceId: string) => {
    console.log('Toggling line items for invoice:', invoiceId);
    console.log('Current invoice line items:', invoices.find(inv => inv.id === invoiceId)?.lineItems);
    setShowLineItems(prev => ({
      ...prev,
      [invoiceId]: !prev[invoiceId]
    }));
  };

  const handleAddLineItem = () => {
    if (!editingInvoice) return;
    
    const newLineItem: Omit<LineItem, 'id' | 'invoiceId' | 'createdAt'> = {
      description: '',
      quantity: 1,
      unitPrice: 0,
      total: 0
    };
    
    setEditingInvoice({
      ...editingInvoice,
      lineItems: [...(editingInvoice.lineItems || []), {
        ...newLineItem,
        id: `temp-${Date.now()}`,
        invoiceId: editingInvoice.id,
        createdAt: new Date().toISOString()
      }]
    });
  };
  
  const handleUpdateLineItem = (index: number, field: keyof LineItem, value: any) => {
    if (!editingInvoice || !editingInvoice.lineItems) return;
    
    const updatedLineItems = [...editingInvoice.lineItems];
    updatedLineItems[index] = {
      ...updatedLineItems[index],
      [field]: value
    };
    
    // If quantity or unitPrice changed, update total
    if (field === 'quantity' || field === 'unitPrice') {
      const quantity = updatedLineItems[index].quantity || 0;
      const unitPrice = updatedLineItems[index].unitPrice || 0;
      updatedLineItems[index].total = quantity * unitPrice;
    }
    
    setEditingInvoice({
      ...editingInvoice,
      lineItems: updatedLineItems,
      // Update invoice total amount
      amount: updatedLineItems.reduce((sum, item) => sum + item.total, 0)
    });
  };
  
  const handleRemoveLineItem = (index: number) => {
    if (!editingInvoice || !editingInvoice.lineItems) return;
    
    const updatedLineItems = [...editingInvoice.lineItems];
    updatedLineItems.splice(index, 1);
    
    setEditingInvoice({
      ...editingInvoice,
      lineItems: updatedLineItems,
      // Update invoice total amount
      amount: updatedLineItems.reduce((sum, item) => sum + item.total, 0)
    });
  };
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Processed Invoices</h2>
      {invoices.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No invoices found. Upload an invoice in the chat to get started.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead 
                className="cursor-pointer"
                onClick={() => handleSort('vendorName')}
              >
                Vendor
                {sortField === 'vendorName' && (
                  <span>{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>
                )}
              </TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Invoice #</TableHead>
              <TableHead 
                className="cursor-pointer"
                onClick={() => handleSort('invoiceDate')}
              >
                Date
                {sortField === 'invoiceDate' && (
                  <span>{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>
                )}
              </TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead 
                className="cursor-pointer"
                onClick={() => handleSort('amount')}
              >
                Amount
                {sortField === 'amount' && (
                  <span>{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>
                )}
              </TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <React.Fragment key={invoice.id}>
                <TableRow>
                  <TableCell>{invoice.vendorName}</TableCell>
                  <TableCell>{invoice.customerName}</TableCell>
                  <TableCell>{invoice.invoiceNumber}</TableCell>
                  <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                  <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                  <TableCell>${invoice.amount.toFixed(2)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setEditingInvoice(invoice)}
                          >
                            Edit
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl">
                          <DialogHeader>
                            <DialogTitle>Edit Invoice</DialogTitle>
                          </DialogHeader>
                          {editingInvoice && (
                            <div className="grid gap-4 py-4">
                              <div className="grid grid-cols-4 items-center gap-4">
                                <label htmlFor="vendor">Vendor</label>
                                <Input
                                  id="vendor"
                                  value={editingInvoice.vendorName}
                                  onChange={(e) => setEditingInvoice({
                                    ...editingInvoice,
                                    vendorName: e.target.value
                                  })}
                                  className="col-span-3"
                                />
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <label htmlFor="customer">Customer</label>
                                <Input
                                  id="customer"
                                  value={editingInvoice.customerName}
                                  onChange={(e) => setEditingInvoice({
                                    ...editingInvoice,
                                    customerName: e.target.value
                                  })}
                                  className="col-span-3"
                                />
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <label htmlFor="invoice-number">Invoice #</label>
                                <Input
                                  id="invoice-number"
                                  value={editingInvoice.invoiceNumber}
                                  onChange={(e) => setEditingInvoice({
                                    ...editingInvoice,
                                    invoiceNumber: e.target.value
                                  })}
                                  className="col-span-3"
                                />
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <label htmlFor="invoice-date">Invoice Date</label>
                                <Input
                                  id="invoice-date"
                                  type="date"
                                  value={toInputDateFormat(editingInvoice.invoiceDate)}
                                  onChange={(e) => setEditingInvoice({
                                    ...editingInvoice,
                                    invoiceDate: e.target.value
                                  })}
                                  className="col-span-3"
                                />
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <label htmlFor="due-date">Due Date</label>
                                <Input
                                  id="due-date"
                                  type="date"
                                  value={toInputDateFormat(editingInvoice.dueDate)}
                                  onChange={(e) => setEditingInvoice({
                                    ...editingInvoice,
                                    dueDate: e.target.value || null
                                  })}
                                  className="col-span-3"
                                />
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <label htmlFor="amount">Amount</label>
                                <Input
                                  id="amount"
                                  type="number"
                                  value={editingInvoice.amount}
                                  onChange={(e) => setEditingInvoice({
                                    ...editingInvoice,
                                    amount: parseFloat(e.target.value)
                                  })}
                                  className="col-span-3"
                                />
                              </div>
                              
                              <div className="border-t pt-4 mt-2">
                                <h3 className="text-lg font-medium mb-2">Line Items</h3>
                                
                                {editingInvoice.lineItems && editingInvoice.lineItems.length > 0 ? (
                                  <div className="space-y-4">
                                    {editingInvoice.lineItems.map((item, index) => (
                                      <div key={item.id} className="grid grid-cols-12 gap-2 items-center border p-2 rounded">
                                        <div className="col-span-5">
                                          <label className="text-xs">Description</label>
                                          <Input
                                            value={item.description}
                                            onChange={(e) => handleUpdateLineItem(index, 'description', e.target.value)}
                                          />
                                        </div>
                                        <div className="col-span-2">
                                          <label className="text-xs">Quantity</label>
                                          <Input
                                            type="number"
                                            value={item.quantity || ''}
                                            onChange={(e) => handleUpdateLineItem(
                                              index, 
                                              'quantity', 
                                              e.target.value ? parseFloat(e.target.value) : null
                                            )}
                                          />
                                        </div>
                                        <div className="col-span-2">
                                          <label className="text-xs">Unit Price</label>
                                          <Input
                                            type="number"
                                            value={item.unitPrice || ''}
                                            onChange={(e) => handleUpdateLineItem(
                                              index, 
                                              'unitPrice', 
                                              e.target.value ? parseFloat(e.target.value) : null
                                            )}
                                          />
                                        </div>
                                        <div className="col-span-2">
                                          <label className="text-xs">Total</label>
                                          <Input
                                            type="number"
                                            value={item.total}
                                            onChange={(e) => handleUpdateLineItem(
                                              index, 
                                              'total', 
                                              parseFloat(e.target.value)
                                            )}
                                          />
                                        </div>
                                        <div className="col-span-1 flex items-end justify-end">
                                          <Button 
                                            variant="destructive" 
                                            size="icon"
                                            onClick={() => handleRemoveLineItem(index)}
                                          >
                                            ×
                                          </Button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-gray-500 text-sm">No line items added yet.</p>
                                )}
                                
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="mt-2"
                                  onClick={handleAddLineItem}
                                >
                                  Add Line Item
                                </Button>
                              </div>
                              
                              <Button onClick={handleSaveEdit}>Save Changes</Button>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleDeleteInvoice(invoice.id)}
                      >
                        Delete
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleLineItems(invoice.id)}
                      >
                        {showLineItems[invoice.id] ? 'Hide Items' : 'Show Items'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                
                {/* Line Items Expandable Section */}
                {showLineItems[invoice.id] && (
                  <TableRow className="bg-muted/30">
                    <TableCell colSpan={7} className="p-0">
                      <div className="p-4">
                        <h4 className="font-medium mb-2">Line Items</h4>
                        {invoice.lineItems && invoice.lineItems.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted">
                                <TableHead>Description</TableHead>
                                <TableHead>Quantity</TableHead>
                                <TableHead>Unit Price</TableHead>
                                <TableHead>Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {invoice.lineItems.map((item) => (
                                <TableRow key={item.id} className="bg-muted/20 hover:bg-muted/40 border-muted">
                                  <TableCell>{item.description}</TableCell>
                                  <TableCell>{item.quantity || 'N/A'}</TableCell>
                                  <TableCell>
                                    {item.unitPrice ? `$${item.unitPrice.toFixed(2)}` : 'N/A'}
                                  </TableCell>
                                  <TableCell>${item.total.toFixed(2)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <p className="text-muted-foreground">No line items found for this invoice.</p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
} 