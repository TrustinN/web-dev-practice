import logging
import sys

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AnyMessage
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.runnables import RunnableConfig
from langchain_ollama.chat_models import ChatOllama
from langchain_openai.chat_models.base import ChatOpenAI
from langgraph.graph import StateGraph
from langgraph.prebuilt.tool_node import ToolNode
from typing_extensions import TypedDict
from utils import _set_env, create_agent, tavily_response_tool

logger = logging.getLogger("uvicorn.error")

llama = ChatOllama(model="llama3.2")
deepseek = ChatOllama(model="deepseek-r1")
gpt = ChatOpenAI(model="gpt-4o-mini")
_set_env("OPENAI_API_KEY")

parser = JsonOutputParser()


class State(TypedDict):
    messages: list[AnyMessage]
    sender: str
    prereqs: dict[str, str]


def run_agent_node(
    state: State, agent: BaseChatModel, name: str, config: RunnableConfig
):
    messages = state["messages"]
    result = agent.invoke(state, config)

    if name == "Translator":
        data = parser.invoke(result)
        prereqs = data["prereqs"]
        logger.error(prereqs)
        return {
            "messages": messages + [result],
            "sender": name,
            "prereqs": state["prereqs"],
        }
    if name == "Researcher":
        logging.error("SUCCESS")

    return {
        "messages": messages + [result],
        "sender": name,
        "prereqs": state["prereqs"],
    }


translator_agent = create_agent(
    llm=llama,
    tools=[],
    sys_msg="You should return a JSON with the following fields: type, prereqs, response. The type field contains the type of the message you received. It is either soft or technical, technical means you need more info to answer the question. The prereqs field should be a table containing mappings for prerequisite fields we need to know to answer the prompt. These should all be instantiated to the empty string. PLEASE FILL OUT the prerequisite fields for which the USER has given CONCRETE data for. Finally, the response field should tell the user which prerequisite fields are missing if any. If it is technical, the prereqs field is mandatory.",
)

search_agent = create_agent(
    llm=llama,
    tools=[tavily_response_tool],
    sys_msg="If all prerequisites are available, use the data you are given to do a search. Make sure to prefix your response with FINAL ANSWER",
)

response_agent = create_agent(
    llm=deepseek,
    tools=[],
    sys_msg="If the team was successful in answering the question, format the response for the client to see. Otherwise, tell the person what data your team is missing. You are required to prefix your response with DONE: <content> and pass it to the user. If there are any other prefixes like FINAL ANSWER, please remove it.",
)


def translator_node(state, config=None):
    return run_agent_node(
        state=state, agent=translator_agent, name="Translator", config=config
    )


def search_node(state, config=None):
    return run_agent_node(
        state=state, agent=search_agent, name="Researcher", config=config
    )


def response_node(state, config=None):
    return run_agent_node(
        state=state, agent=response_agent, name="Responder", config=config
    )


tools = [tavily_response_tool]
tool_node = ToolNode(tools)


def router(state: State):
    messages = state["messages"]
    last_msg = messages[-1]
    logger.error(state["sender"])

    if state["sender"] == "Translator":
        prereqs = state["prereqs"]
        for val in prereqs.values():
            if val == "":
                logger.error("INSUFFICIENT INPUT")
                return "continue"
        return "continue"

    if type(last_msg["content"] is str) and last_msg.contains("FINAL ANSWER"):
        return "end"

    if len(last_msg["tool_calls"]) > 0:
        return "call_tool"

    return "continue"


START = sys.intern("__start__")
END = sys.intern("__end__")

workflow = StateGraph(State)
workflow.add_node("Researcher", search_node)
workflow.add_node("Translator", translator_node)
workflow.add_node("Responder", response_node)
workflow.add_node("call_tool", tool_node)

workflow.add_conditional_edges(
    "Translator",
    router,
    {"continue": "Researcher", "call_tool": "call_tool", "end": "Responder"},
)

workflow.add_conditional_edges(
    "Researcher",
    router,
    {"continue": "Responder", "call_tool": "call_tool", "end": "Responder"},
)

workflow.add_conditional_edges(
    "call_tool",
    lambda x: x["sender"],
    {"Researcher": "Researcher", "Translator": "Researcher"},
)

workflow.add_edge(START, "Translator")
workflow.add_edge("Responder", END)

grph = workflow.compile()
