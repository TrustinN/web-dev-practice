import { ChatHistory } from "@/lib/ChatHistory";
import { bot } from "@/lib/bot";

const chatHistory = new ChatHistory();

export async function POST(request: Request) {
  const { prompt } = await request.json();

  const reply = await bot(prompt, chatHistory);
  return new Response(JSON.stringify({ reply: reply }));
}
