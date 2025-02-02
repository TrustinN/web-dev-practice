import { OpenAI } from "@openai/openai";
import { ChatHistory } from "@/lib/ChatHistory";

export async function bot(prompt: string, chatHistory: ChatHistory) {
  const client = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"],
  });

  chatHistory.add("user", prompt);

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini-2024-07-18",
    messages: chatHistory.data,
  });

  const reply = await completion.choices[0]?.message?.content;

  chatHistory.add("assistant", reply);

  return reply;
}
