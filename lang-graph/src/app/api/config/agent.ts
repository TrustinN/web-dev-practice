import "dotenv/config";

import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";

import { ChatOpenAI } from "@langchain/openai";
import { StructuredTool } from "@langchain/core/tools";
import { Runnable } from "@langchain/core/runnables";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { DynamicStructuredTool } from "@langchain/core/tools";

export async function createAgent({
  llm,
  tools,
  systemMessage,
}: {
  llm: ChatOpenAI;
  tools: StructuredTool[];
  systemMessage: string;
}): Promise<Runnable> {
  const toolNames = tools.map((tool) => tool.name).join(", ");
  const formattedTools = tools.map((t) => convertToOpenAITool(t));

  let prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "You are a helpful AI assistant, collaborating with other assistants." +
        " Use the provided tools to progress towards answering the question." +
        " If you are unable to fully answer, that's OK, another assistant with different tools " +
        " will help where you left off. Execute what you can to make progress." +
        " If you or any of the other assistants have the final answer or deliverable," +
        " prefix your response with FINAL ANSWER so the team knows to stop." +
        " You have access to the following tools: {tool_names}.\n{system_message}",
    ],
    new MessagesPlaceholder("messages"),
  ]);
  prompt = await prompt.partial({
    system_message: systemMessage,
    tool_names: toolNames,
  });
  return prompt.pipe(llm.bind({ tools: formattedTools }));
}

const typeEnum = ["soft", "technical"] as const;

export const ResponseFormatter = z.object({
  type: z.enum(typeEnum).describe("Is this a soft or technical prompt?"),
  prereqs: z
    .record(z.string(), z.string())
    .describe("A mapping of prerequisites to their known values."),
  response: z.string().describe("The answer to the query"),
});

export const responseFormatterTool = tool(async () => {}, {
  name: "responseFormatter",
  schema: ResponseFormatter,
});

export const tavilyTool = new TavilySearchResults({
  apiKey: process.env["TAVILY_API_KEY"],
});

export const ResponseFormatter2 = z.object({
  type: z.enum(typeEnum).describe("Is this a soft or technical prompt?"),
  prereqs: z
    .array(z.string())
    .describe("A mapping of prerequisites to their known values."),
  response: z.string().describe("The answer to the query"),
});

export const tavilyResponseTool = new DynamicStructuredTool<
  typeof ResponseFormatter2
>({
  description: "Search the web using the prerequisite knowledge given",
  func: (input): Promise<string> => {
    const { response, prereqs } = ResponseFormatter2.parse(input);

    return tavilyTool.invoke(response + " " + prereqs.toString());
  },
  name: "DynamicTavilySearch",
  schema: ResponseFormatter2,
});
