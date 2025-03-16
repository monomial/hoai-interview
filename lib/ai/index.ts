export async function chat(
  messages: Message[],
  options: {
    selectedChatModel: string;
    session: Session;
    dataStream: DataStreamWriter;
  },
) {
  const { selectedChatModel, session, dataStream } = options;

  // Log the last user message to check for invoice processing trigger
  const lastUserMessage = messages.filter(m => m.role === 'user').pop();
  if (lastUserMessage) {
    console.log(`[DEBUG] Last user message: "${typeof lastUserMessage.content === 'string' ? lastUserMessage.content : 'Non-string content'}"`);
    
    // Check if the message contains "process this invoice"
    if (typeof lastUserMessage.content === 'string' && lastUserMessage.content.toLowerCase().includes('process this invoice')) {
      console.log('[DEBUG] Detected "process this invoice" trigger in user message');
    }
    
    // Check if there are attachments
    const attachments = lastUserMessage.content && typeof lastUserMessage.content !== 'string' 
      ? (lastUserMessage.content as any).attachments || [] 
      : [];
    
    if (attachments.length > 0) {
      console.log(`[DEBUG] Message has ${attachments.length} attachments`);
      attachments.forEach((attachment: any, index: number) => {
        console.log(`[DEBUG] Attachment ${index + 1}: type=${attachment.type}, name=${attachment.name || 'unnamed'}`);
      });
    }
  }

  // ... rest of the function ...
} 