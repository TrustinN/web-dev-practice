import { OpenAI } from "@openai/openai";

type MessageItem = { from: "user" | "assistant"; content: string };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const threadId = url.pathname.split("/")[4];
  console.log(threadId);
  const client = new OpenAI({
    apiKey: process.env["OPENAI_API_KEY"],
  });

  try {
    const threadMessages = await client.beta.threads.messages.list(threadId);
    const data = threadMessages.data;
    console.log(data);
    return new Response(
      JSON.stringify({
        messages: data.map(
          (tm): MessageItem => ({
            from: tm.role,
            content:
              tm.content[0].type === "text" ? tm.content[0].text.value : "",
          }),
        ),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch thread messages" }),
      { status: 500 },
    );
  }
}
