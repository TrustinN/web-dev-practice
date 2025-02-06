import { OpenAI } from "@openai/openai";

export async function POST(request: Request) {
  const client = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"],
  });

  const { id, role, content, fileId } = await request.json();
  let message: {
    role: "user" | "assistant";
    content: string;
    attachments?: { file_id: string }[];
  } = {
    role: role,
    content: content,
  };
  if (fileId !== "") {
    message.attachments = [{ file_id: fileId }];
  }

  const threadMessage = await client.beta.threads.messages.create(id, message);
  return new Response(JSON.stringify(threadMessage));
}

export async function DELETE(request: Request) {
  const client = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"],
  });

  const { threadId } = await request.json();
  await client.beta.threads.del(threadId);
}
