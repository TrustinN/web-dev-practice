import { OpenAI } from "openai";

export async function POST(request: Request) {
  const client = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"],
  });

  const assistant = await client.beta.assistants.create({
    model: "gpt-4o-mini-2024-07-18",
  });
  return new Response(JSON.stringify({ assistantId: assistant.id }));
}
