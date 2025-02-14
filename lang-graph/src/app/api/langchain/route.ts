import { HumanMessage } from "@langchain/core/messages";
import { graph } from "@/app/api/config/graph";

export async function POST(request: Request) {
  const { content } = await request.json();
  const stream = graph.stream(
    {
      messages: [new HumanMessage({ content: content })],
    },
    { recursionLimit: 150 },
  );
  return new Response(SSEStream(stream), {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function SSEStream(stream: any) {
  return new ReadableStream({
    async start(controller) {
      for await (const output of await stream) {
        const keys = Object.keys(output);
        const firstItem = output[keys[0]];
        if ("messages" in firstItem && Array.isArray(firstItem.messages)) {
          const lastMessage = firstItem.messages[firstItem.messages.length - 1];
          controller.enqueue("a");
        }
      }
      controller.close();
    },
  });
}
