import {
  createAgent,
  ResponseFormatter,
  tavilyResponseTool,
} from "@/app/api/config/agent";

import { ChatOpenAI } from "@langchain/openai";
import { Runnable, RunnableConfig } from "@langchain/core/runnables";
import { BaseMessage, AIMessage } from "@langchain/core/messages";
import { JsonOutputParser } from "@langchain/core/output_parsers";

import { Annotation } from "@langchain/langgraph/web";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { END, START, StateGraph } from "@langchain/langgraph/web";

const parser = new JsonOutputParser();
const gpt = new ChatOpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
  model: "gpt-4o-mini",
});

// State is passed as input to nodes in the graph
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  sender: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "user",
    default: () => "user",
  }),
  prereqs: Annotation<Record<string, string>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
});

// Helper function for defining node functions
const runAgentNode = async ({
  state,
  agent,
  name,
  config,
}: {
  state: typeof AgentState.State;
  agent: Runnable;
  name: string;
  config?: RunnableConfig;
}) => {
  const result = await agent.invoke(state, config);

  if (name == "Translator") {
    const data = await parser.invoke(result);
    const { prereqs } = ResponseFormatter.parse(data);

    return {
      messages: [result],
      sender: name,
      prereqs: prereqs,
    };
  }

  return {
    messages: [result],
    sender: name,
  };
};

// Formats a json object to pass to the researcher based on the user prompt
const translatorAgent = await createAgent({
  llm: gpt,
  tools: [],
  systemMessage:
    "You should return a JSON with the following fields: type, prereqs, response. The type field contains the type of the message you received. It is either soft or technical, technical means you need more info to answer the question. The prereqs field should be a table containing mappings for prerequisite fields we need to know to answer the prompt. These should all be instantiated to the empty string. Then fill out the prerequisite fields for which the USER has given CONCRETE data for. Finally, the response field should tell the user which prerequisite fields are missing if any. If it is technical, the prereqs field is mandatory.",
});

// Searches the web for a response to the user.
const searchAgent = await createAgent({
  llm: gpt,
  tools: [tavilyResponseTool],
  systemMessage:
    "If all prerequisites are available, use the data you are given to do a search. Make sure to prefix your response with FINAL ANSWER",
});

// Formats the response to the user
const responseAgent = await createAgent({
  llm: gpt,
  tools: [],
  systemMessage:
    "You should respond with what is passed in. You are required to prefix your response with DONE: <content> and pass it to the user. If there are any other prefixes like FINAL ANSWER, please remove it.",
});

const translatorNode = async (
  state: typeof AgentState.State,
  config?: RunnableConfig,
) => {
  return runAgentNode({
    state: state,
    agent: translatorAgent,
    name: "Translator",
    config: config,
  });
};

const searchNode = async (
  state: typeof AgentState.State,
  config?: RunnableConfig,
) => {
  return runAgentNode({
    state: state,
    agent: searchAgent,
    name: "Researcher",
    config: config,
  });
};

const responseNode = async (
  state: typeof AgentState.State,
  config?: RunnableConfig,
) => {
  return runAgentNode({
    state: state,
    agent: responseAgent,
    name: "Responder",
    config: config,
  });
};

const tools = [tavilyResponseTool];
const toolNode = new ToolNode<typeof AgentState.State>(tools);

// Node to determine which agent to route state to
async function router(state: typeof AgentState.State) {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1] as AIMessage;
  // console.log(lastMessage, "\n\n\n\n");
  if (state.sender == "Translator") {
    const prereqs = state.prereqs;
    for (const val of Object.values(prereqs)) {
      if (val === "") {
        return "end";
      }
    }
  }
  if (
    typeof lastMessage.content === "string" &&
    lastMessage.content.includes("FINAL ANSWER")
  ) {
    return "end";
  }

  if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
    return "call_tool";
  }

  return "continue";
}

const workflow = new StateGraph(AgentState)
  .addNode("Researcher", searchNode)
  .addNode("Translator", translatorNode)
  .addNode("Responder", responseNode)
  .addNode("call_tool", toolNode);

workflow.addConditionalEdges("Translator", router, {
  // We will transition to the other agent
  continue: "Researcher",
  call_tool: "call_tool",
  end: "Responder",
});

workflow.addConditionalEdges("Researcher", router, {
  // We will transition to the other agent
  continue: "Responder",
  call_tool: "call_tool",
  end: "Responder",
});

workflow.addConditionalEdges(
  "call_tool",
  (x) => {
    return x.sender;
  },
  {
    Researcher: "Researcher",
    Translator: "Researcher",
  },
);

workflow.addEdge("Responder", END);

workflow.addEdge(START, "Translator");
export const graph = workflow.compile();
