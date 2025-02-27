import { HumanMessage } from "@langchain/core/messages";
import { graph } from "@/app/api/config/graph";

export async function POST(request: Request) {
  const { content } = await request.json();
  const response = await graph.invoke(
    {
      messages: [new HumanMessage({ content: content })],
    },
    { recursionLimit: 150 },
  );
  const messages = response.messages;
  const lastMessage = messages[messages.length - 1];
  const prereqs = response.prereqs;
  return new Response(
    JSON.stringify({ content: lastMessage.content, formData: prereqs }),
  );

  // const stream = graph.stream(
  //   {
  //     messages: [new HumanMessage({ content: content })],
  //   },
  //   { recursionLimit: 150 },
  // );

  // return new Response(SSEStream(stream), {
  //   headers: { "Content-Type": "text/event-stream" },
  // });
}

// function SSEStream(stream: any) {
//   return new ReadableStream({
//     async start(controller) {
//       for await (const output of await stream) {
//         const keys = Object.keys(output);
//         const firstItem = output[keys[0]];
//         if ("messages" in firstItem && Array.isArray(firstItem.messages)) {
//           const messages = firstItem.messages;
//           const lastMessage = messages[messages.length - 1];
//           console.log(lastMessage, "\n\n\n\n");
//           if (
//             typeof lastMessage.content === "string" &&
//             lastMessage.content.includes("DONE")
//           ) {
//             controller.enqueue(
//               lastMessage.content.slice(6, lastMessage.content.length),
//             );
//           }
//         }
//       }
//       controller.close();
//     },
//   });
// }
