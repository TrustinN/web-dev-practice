import { createAgent } from "@/app/api/config/agent";
import {
  responseFormatterTool,
  tavilyResponseTool,
} from "@/app/api/config/agent";

import { ChatOpenAI } from "@langchain/openai";
import { Runnable, RunnableConfig } from "@langchain/core/runnables";
import { BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
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
  type: Annotation<string>({
    reducer: (x, y) => (y ? y : x),
    default: () => "soft",
  }),
  cache: Annotation<Record<string, string>>({
    reducer: (x, y) => {
      return { ...x, ...y };
    },
    default: () => {
      return {};
    },
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
  console.log("Currently running: ", name);
  const result = await agent.invoke(state, config);
  let cache = {};
  let type = state.type;
  if (result.content != "") {
    const data = await parser.invoke(result);
    cache = data["prereqs"];
    type = data["type"];
    // console.log(data);
  }
  // if (result.tool_calls) {
  //   console.log(result.tool_calls);
  // }
  // console.log(result);

  return {
    messages: [result],
    sender: name,
    type: type,
    cache: cache,
  };
};

// Formats a json object to pass to the researcher based on the user prompt
const translatorAgent = await createAgent({
  llm: gpt,
  tools: [],
  systemMessage:
    "You should return a JSON with the following fields: type, prereqs, response. The type field contains the type of the message you received. It is either soft or technical, technical means we require data to answer accurately. The prereqs field should be a table containing mappings for prerequisite fields we need to know to answer the prompt. These should all be instantiated to the empty string. Finally, the response field should contain your response to the user. If it is technical, the prereqs field is mandatory",
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

// Searches the web for a response to the user.
const searchAgent = await createAgent({
  llm: gpt,
  tools: [tavilyResponseTool],
  systemMessage:
    "You should provide an accurate answer to the user. You are given the type of question (soft/technical) and prerequisite data from another agent. You should use both of these to formulate a search to return an accurate answer. Please put this in the response field of your tool call",
});

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

const tools = [tavilyResponseTool, responseFormatterTool];
const toolNode = new ToolNode<typeof AgentState.State>(tools);

// Node to determine which agent to route state to
function router(state: typeof AgentState.State) {
  const messages = state.messages;
  // console.log(messages);
  const lastMessage = messages[messages.length - 1] as AIMessage;
  if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
    // The previous agent is invoking a tool
    return "call_tool";
  }
  if (
    typeof lastMessage.content === "string" &&
    (lastMessage.content.includes("FINAL ANSWER") ||
      lastMessage.content.includes("INSUFFICIENT DATA"))
  ) {
    console.log("END RESPONSE");
    // Any agent decided the work is done
    return "end";
  }
  return "continue";
}

const workflow = new StateGraph(AgentState)
  .addNode("Researcher", searchNode)
  .addNode("Translator", translatorNode)
  .addNode("call_tool", toolNode);

workflow.addConditionalEdges("Translator", router, {
  // We will transition to the other agent
  continue: "Researcher",
  call_tool: "call_tool",
  end: END,
});

workflow.addConditionalEdges("Researcher", router, {
  // We will transition to the other agent
  continue: "Translator",
  call_tool: "call_tool",
  end: END,
});

workflow.addConditionalEdges(
  "call_tool",
  (x) => {
    // console.log("Sender: ", x.sender);
    return x.sender;
  },
  {
    Researcher: "Researcher",
    Translator: "Researcher",
  },
);

workflow.addEdge(START, "Translator");
export const graph = workflow.compile();
