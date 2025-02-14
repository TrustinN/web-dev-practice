import { OpenAI } from "openai";

const client = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
});
export async function POST(request: Request) {
  const { threadId, assistantId } = await request.json();
  return new Response(SSEStream(threadId, assistantId), {
    headers: { "Content-Type": "text/event-stream" },
  });
}

function SSEStream(threadId: string, assistantId: string) {
  return new ReadableStream({
    async start(controller) {
      client.beta.threads.runs
        .stream(threadId, {
          assistant_id: assistantId,
        })
        .on("textDelta", (textDelta) => {
          // process.stdout.write(textDelta.value!);
          controller.enqueue(textDelta.value!);
        })
        .on("end", () => {
          // process.stdout.write("done\n");
          controller.close();
        });
    },
  });
}
