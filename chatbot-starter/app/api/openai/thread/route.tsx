import { OpenAI } from "@openai/openai";

export async function POST(request: Request) {
  const client = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"],
  });
  const newThread = await client.beta.threads.create();
  console.log(newThread);
  return new Response(JSON.stringify({ threadId: newThread.id }));
}
