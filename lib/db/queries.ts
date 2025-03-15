import 'server-only';
import { and, asc, desc, eq, gt, gte, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

import {
  chat,
  document,
  invoice,
  lineItem,
  type Suggestion,
  suggestion,
  type Message,
  message,
  vote,
} from './schema';
import type { BlockKind } from '@/components/block';
import { generateUUID } from '../utils';

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const sqlite = new Database('sqlite.db');
const db = drizzle(sqlite);

export async function saveChat({
  id,
  userId,
  title,
}: {
  id: string;
  userId: string;
  title: string;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      // userId,
      title,
    });
  } catch (error) {
    console.error('Failed to save chat in database');
    throw error;
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));

    return await db.delete(chat).where(eq(chat.id, id));
  } catch (error) {
    console.error('Failed to delete chat by id from database');
    throw error;
  }
}

export async function getChatsByUserId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(chat)
      // .where(eq(chat.userId, id))
      .orderBy(desc(chat.createdAt));
  } catch (error) {
    console.error('Failed to get chats by user from database');
    throw error;
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    console.error('Failed to get chat by id from database');
    throw error;
  }
}

export async function saveMessages({ messages }: { messages: Array<Message> }) {
  try {
    return await db.insert(message).values(messages);
  } catch (error) {
    console.error('Failed to save messages in database', error);
    throw error;
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    console.error('Failed to get messages by chat id from database', error);
    throw error;
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });
  } catch (error) {
    console.error('Failed to upvote message in database', error);
    throw error;
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    console.error('Failed to get votes by chat id from database', error);
    throw error;
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: BlockKind;
  content: string;
  userId: string;
}) {
  try {
    return await db.insert(document).values({
      id,
      title,
      kind,
      content,
      // userId,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to save document in database');
    throw error;
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    console.error('Failed to get document by id from database');
    throw error;
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    console.error('Failed to get document by id from database');
    throw error;
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp),
        ),
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)));
  } catch (error) {
    console.error(
      'Failed to delete documents by id after timestamp from database',
    );
    throw error;
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (error) {
    console.error('Failed to save suggestions in database');
    throw error;
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(and(eq(suggestion.documentId, documentId)));
  } catch (error) {
    console.error(
      'Failed to get suggestions by document version from database',
    );
    throw error;
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    console.error('Failed to get message by id from database');
    throw error;
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds)),
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
  } catch (error) {
    console.error(
      'Failed to delete messages by id after timestamp from database',
    );
    throw error;
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    console.error('Failed to update chat visibility in database');
    throw error;
  }
}

// Invoice queries
export async function saveInvoice({
  customerName,
  vendorName,
  invoiceNumber,
  invoiceDate,
  dueDate,
  amount,
  filePath,
}: {
  customerName: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  amount: number;
  filePath?: string;
}) {
  const id = generateUUID();
  const createdAt = new Date();

  await db.insert(invoice).values({
    id,
    customerName,
    vendorName,
    invoiceNumber,
    invoiceDate,
    dueDate,
    amount,
    filePath,
    createdAt,
  });

  return { id };
}

export async function saveLineItems({
  invoiceId,
  items,
}: {
  invoiceId: string;
  items: Array<{
    description: string;
    quantity?: number;
    unitPrice?: number;
    total: number;
  }>;
}) {
  const createdAt = new Date();

  for (const item of items) {
    await db.insert(lineItem).values({
      id: generateUUID(),
      invoiceId,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      createdAt,
    });
  }
}

export async function getInvoices() {
  const invoices = await db.select().from(invoice).orderBy(desc(invoice.createdAt));
  
  // Fetch line items for each invoice
  const result = [];
  for (const inv of invoices) {
    const items = await db
      .select()
      .from(lineItem)
      .where(eq(lineItem.invoiceId, inv.id));
    
    result.push({
      ...inv,
      lineItems: items
    });
  }
  
  return result;
}

export async function getInvoiceById({ id }: { id: string }) {
  const invoiceData = await db
    .select()
    .from(invoice)
    .where(eq(invoice.id, id))
    .get();

  if (!invoiceData) {
    return null;
  }

  const lineItems = await db
    .select()
    .from(lineItem)
    .where(eq(lineItem.invoiceId, id));

  return {
    ...invoiceData,
    lineItems,
  };
}

export async function updateInvoice({
  id,
  customerName,
  vendorName,
  invoiceNumber,
  invoiceDate,
  dueDate,
  amount,
}: {
  id: string;
  customerName: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  amount: number;
}) {
  await db
    .update(invoice)
    .set({
      customerName,
      vendorName,
      invoiceNumber,
      invoiceDate,
      dueDate,
      amount,
    })
    .where(eq(invoice.id, id));
}

export async function deleteInvoiceById({ id }: { id: string }) {
  // First delete line items
  await db.delete(lineItem).where(eq(lineItem.invoiceId, id));
  
  // Then delete invoice
  await db.delete(invoice).where(eq(invoice.id, id));
}

export async function findInvoiceByInvoiceNumber({ invoiceNumber }: { invoiceNumber: string }) {
  return db
    .select()
    .from(invoice)
    .where(eq(invoice.invoiceNumber, invoiceNumber))
    .get();
}

export async function findDuplicateInvoice({ 
  invoiceNumber, 
  vendorName 
}: { 
  invoiceNumber: string;
  vendorName: string;
}) {
  return db
    .select()
    .from(invoice)
    .where(
      and(
        eq(invoice.invoiceNumber, invoiceNumber),
        eq(invoice.vendorName, vendorName)
      )
    )
    .get();
}

export async function deleteLineItemsByInvoiceId({ invoiceId }: { invoiceId: string }) {
  await db.delete(lineItem).where(eq(lineItem.invoiceId, invoiceId));
}
