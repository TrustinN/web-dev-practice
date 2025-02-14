import { Runnable } from "@langchain/core/runnables";
import { AgentState } from "@/components/State";
import { createAgent } from "./Agents";
import { HumanMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { tavilyTool, chartTool } from "./Tools";

async function runAgentNode({
  state,
  agent,
  name,
  config,
}: {
  state: typeof AgentState.State;
  agent: Runnable;
  name: string;
  config?: RunnableConfig;
}) {
  let result = await agent.invoke(state, config);
  if (!result?.tool_calls || result.tool_calls.length === 0) {
    result = new HumanMessage({ ...result, name: name });
  }
  // return new state
  return {
    messages: [result],
    sender: name,
  };
}

const llm = new ChatOpenAI({ modelName: "gpt-4o" });

const researchAgent = await createAgent({
  llm,
  tools: [tavilyTool],
  systemMessage:
    "You should provide accurate data for the chart generator to use.",
});

async function researchNode(
  state: typeof AgentState.State,
  config?: RunnableConfig,
) {
  return runAgentNode({
    state: state,
    agent: researchAgent,
    name: "Researcher",
    config,
  });
}

// Chart Generator
const chartAgent = await createAgent({
  llm,
  tools: [chartTool],
  systemMessage: "Any charts you display will be visible by the user.",
});

async function chartNode(state: typeof AgentState.State) {
  return runAgentNode({
    state: state,
    agent: chartAgent,
    name: "ChartGenerator",
  });

import { ToolNode } from "@langchain/langgraph/prebuilt"

const tools = [tavilyTool, chartTool];
const toolNode = new ToolNode<typeof AgentState.State>(tools);}
import { AIMessage } from "@langchain/core/messages";
// Either agent can decide to end
function router(state: typeof AgentState.State) {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1] as AIMessage;
  if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
    // The previous agent is invoking a tool
    return "call_tool";
  }
  if (
    typeof lastMessage.content === "string" &&
    lastMessage.content.includes("FINAL ANSWER")
  ) {
    // Any agent decided the work is done
    return "end";
  }
  return "continue";
}

import { END, START, StateGraph } from "@langchain/langgraph";

// 1. Create the graph
const workflow = new StateGraph(AgentState)
  // 2. Add the nodes; these will do the work
  .addNode("Researcher", researchNode)
  .addNode("ChartGenerator", chartNode)
  .addNode("call_tool", toolNode);

// 3. Define the edges. We will define both regular and conditional ones
// After a worker completes, report to supervisor
workflow.addConditionalEdges("Researcher", router, {
  // We will transition to the other agent
  continue: "ChartGenerator",
  call_tool: "call_tool",
  end: END,
});

workflow.addConditionalEdges("ChartGenerator", router, {
  // We will transition to the other agent
  continue: "Researcher",
  call_tool: "call_tool",
  end: END,
});

workflow.addConditionalEdges(
  "call_tool",
  // Each agent node updates the 'sender' field
  // the tool calling node does not, meaning
  // this edge will route back to the original agent
  // who invoked the tool
  (x) => x.sender,
  {
    Researcher: "Researcher",
    ChartGenerator: "ChartGenerator",
  },
);

workflow.addEdge(START, "Researcher");
  const graph = workflow.compile();

import { useEnterSubmit } from "@/lib/hooks/useEnterSubmit";
import { useState } from "react";

export const runGraph = () => {

  const { formRef, onKeyDown } = useEnterSubmit();
  const [userPrompt, setUserPrompt] = useState<string>("");

  async function submitPrompt(event: React.FormEvent<HTMLFormElement>) {
      event.preventDefault();
    const streamResults = await graph.stream(
      {
        messages: [
          new HumanMessage({
            content:
              "Generate a bar chart of the US gdp over the past 3 years.",
          }),
        ],
      },
      { recursionLimit: 150 },
    );

    const prettifyOutput = (output: Record<string, any>) => {
      const keys = Object.keys(output);
      const firstItem = output[keys[0]];

      if ("messages" in firstItem && Array.isArray(firstItem.messages)) {
        const lastMessage = firstItem.messages[firstItem.messages.length - 1];
        console.dir(
          {
            type: lastMessage._getType(),
            content: lastMessage.content,
            tool_calls: lastMessage.tool_calls,
          },
          { depth: null },
        );
      }

      if ("sender" in firstItem) {
        console.log({
          sender: firstItem.sender,
        });
      }
    };

    for await (const output of await streamResults) {
      if (!output?.__end__) {
        prettifyOutput(output);
        console.log("----");
      }
    }
  }

  return (
    <div>
      <div className="fixed bottom-0 w-full">
        <div className="mx-auto sm:max-w-2xl sm:px-4">
          <div className="space-y-4 border-t backdrop-blur-lg drop-shadow-2xl bg-white/30 px-4 py-2 shadow-lg sm:rounded-t-xl sm:border md:py-4">
            <form ref={formRef} className="" onSubmit={submitPrompt}>
              <div className="shadow-xl flex flex-row space-x-2 rounded bg-white">
                <input
                  name="prompt"
                  autoFocus={true}
                  placeholder="Enter your prompt..."
                  value={userPrompt}
                  onChange={(event) => setUserPrompt(event.target.value)}
                  type="text"
                  className="min-h-[50px] w-full px-4 py-0 focus-within:outline-none rounded text-black"
                  onKeyDown={onKeyDown}
                />
                <button
                  type="submit"
                  className="rounded pr-4 hover:text-blue-400"
                >
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>

};
