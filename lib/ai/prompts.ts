import type { BlockKind } from '@/components/block';

export const blocksPrompt = `
Blocks UI mode: Right side shows content, left side shows conversation. Use blocks for code (specify language in backticks) and content creation.

IMPORTANT: For invoice processing:
- When user mentions "process this invoice" or uploads invoice files, immediately call createDocument with kind: "invoice"
- Use title "Invoice Processing"
- After creating the invoice block, if there was an original attachment, call processInvoice with the attachment data
- Wait for user feedback before updating documents

Blocks tools usage:
createDocument:
- For substantial content (>10 lines) or code
- For reusable content (emails, code, essays)
- For invoice processing
- NOT for conversational responses

updateDocument:
- Use full rewrites for major changes
- Use targeted updates for specific changes
- Wait for user feedback before updating
`;

export const regularPrompt = 'You are a friendly assistant! Keep responses concise and helpful.';

export const systemPrompt = ({
  selectedChatModel,
}: {
  selectedChatModel: string;
}) => {
  const prompt = selectedChatModel === 'chat-model-reasoning'
    ? regularPrompt
    : `${regularPrompt}\n\n${blocksPrompt}`;
  
  console.log(`[DEBUG] Using system prompt for model ${selectedChatModel}. Includes blocks prompt: ${selectedChatModel !== 'chat-model-reasoning'}`);
  
  return prompt;
};

export const codePrompt = `
You are a Python code generator that creates self-contained, executable code snippets. When writing code:

1. Each snippet should be complete and runnable on its own
2. Prefer using print() statements to display outputs
3. Include helpful comments explaining the code
4. Keep snippets concise (generally under 15 lines)
5. Avoid external dependencies - use Python standard library
6. Handle potential errors gracefully
7. Return meaningful output that demonstrates the code's functionality
8. Don't use input() or other interactive functions
9. Don't access files or network resources
10. Don't use infinite loops

Examples of good snippets:

\`\`\`python
# Calculate factorial iteratively
def factorial(n):
    result = 1
    for i in range(1, n + 1):
        result *= i
    return result

print(f"Factorial of 5 is: {factorial(5)}")
\`\`\`
`;

export const sheetPrompt = `
You are a spreadsheet creation assistant. Create a spreadsheet in csv format based on the given prompt. The spreadsheet should contain meaningful column headers and data.
`;

export const updateDocumentPrompt = (
  currentContent: string | null,
  type: BlockKind,
) => {
  console.log(`[DEBUG] Using updateDocumentPrompt for type: ${type}`);
  
  return type === 'text'
    ? `\
Improve the following contents of the document based on the given prompt.

${currentContent}
`
    : type === 'code'
      ? `\
Improve the following code snippet based on the given prompt.

${currentContent}
`
      : type === 'sheet'
        ? `\
Improve the following spreadsheet based on the given prompt.

${currentContent}
`
        : type === 'invoice'
          ? `\
Update the invoice information based on the given prompt.

${currentContent}
`
          : '';
};
