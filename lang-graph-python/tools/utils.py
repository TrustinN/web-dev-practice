import getpass
import logging
import os
from typing import Annotated, List

from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from langchain_core.tools.structured import StructuredTool
from pydantic import BaseModel, Field


def _set_env(var: str):
    if not os.environ.get(var):
        os.environ[var] = getpass.getpass(f"{var}: ")


_set_env("TAVILY_API_KEY")
logger = logging.getLogger("uvicorn.error")


def create_agent(llm: BaseChatModel, tools: List[StructuredTool], sys_msg: str):
    tool_names = map(lambda tool: tool.name, tools)
    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are a helpful AI assistant, collaborating with other assistants."
                + " Use the provided tools to progress towards answering the question."
                + " If you are unable to fully answer, that's OK, another assistant with different tools "
                + " will help where you left off. Execute what you can to make progress."
                + " If you or any of the other assistants have the final answer or deliverable,"
                + " prefix your response with FINAL ANSWER so the team knows to stop."
                + " You have access to the following tools: {tool_names}.\n{system_message}",
            ),
            MessagesPlaceholder("messages"),
        ]
    )

    prompt = prompt.partial(system_message=sys_msg, tool_names=tool_names)
    return prompt | llm.bind_tools(tools)


class resp_formatter(BaseModel):
    prereqs: dict[str, str]
    response: str


class ResponseFormatter(BaseModel):
    # prereqs: List[str]
    response: str = Field(description="Search prompt")


tavily_tool = TavilySearchResults()


from langchain_core.output_parsers import JsonOutputParser

parser = JsonOutputParser()


@tool(name_or_callable="tavily_response_tool", args_schema=ResponseFormatter)
def tavily_response_tool(tool_input: str, callback=None) -> str:
    """Searches the web to answer the user's query using the given prerequisite data.

    Args:
        tool_input: the previous message received from the tool caller.
    """
    # prereqs: A list of data fields required to answer the query, provided by the user.
    # response: The main query or prompt for the web search.
    data = parser.invoke(tool_input)
    logger.error(data)

    # prereq_str = ", ".join(prereqs) if prereqs else ""
    return tavily_tool.invoke(f"{data}")


logger.error(tavily_response_tool)
