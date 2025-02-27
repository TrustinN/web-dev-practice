from typing import Dict, List, TypedDict

from langchain_community.tools import TavilySearchResults
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from langchain_core.tools.structured import StructuredTool
from langchain_openai.chat_models import ChatOpenAI
from langgraph.prebuilt import ToolNode
from pydantic import BaseModel, Field


class MultiplyToolInput(BaseModel):
    a: int = Field(description="first number")
    b: int = Field(description="second number")


def multiply(a: int, b: int) -> str:
    """
    Multiply two numbers
    """
    return a * b


CalculatorTool = StructuredTool.from_function(
    func=multiply,
    name="Calculator",
    description="Multiply numbers",
    args_schema=MultiplyToolInput,
    return_direct=True,
)


class SearchToolInput(BaseModel):
    def __getitem__(self, item):
        return getattr(self, item)

    response: str = Field(
        description="A string that we use to search the internet. Should be efficient"
    )
    prereqs: List[str] = Field(
        description="A mapping of fields to specific data values that we need to know to make an internet search"
    )


class State(TypedDict):
    messages: List[AnyMessage] = Field(description="All messages in the conversation")
    sender: str = Field(description="The name of the model invoking this tool")
    prereqs: Dict[str, str] = Field(
        description="A mapping of fields to specific data values that we need to know to make an internet search"
    )


agent_state: State = {
    "messages": [
        HumanMessage(content="What is the weather today? Berkeley, CA Feb 26, 2025")
    ],
    "sender": "",
    "prereqs": {"location": "Berkeley, CA", "date": "Feb 26, 2025"},
}


agent_state: SearchToolInput = {
    "messages": [
        HumanMessage(content="What is the weather today? Berkeley, CA Feb 26, 2025")
    ],
    "sender": "",
    "prereqs": {"location": "Berkeley, CA", "date": "Feb 26, 2025"},
}


tavilyTool = TavilySearchResults()


def searchInternet(prereqs: List[str], response: str):
    """
    Searches the internet using data given and the prompt to use

    Args:
        response (str): the prompt used as the base of the search
    """
    prereqsListing = ", ".join(prereqs)
    print(prereqsListing)
    return tavilyTool.invoke(f"{response} {prereqsListing}")


SearchTool = StructuredTool.from_function(
    func=searchInternet,
    name="SearchTool",
    description="Search for an answer to the prompt using given data",
    args_schema=SearchToolInput,
    return_direct=True,
)

tools = [CalculatorTool, SearchToolInput]
toolNode = ToolNode(tools=tools)
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
prompt = prompt.partial(
    tool_names=map(lambda x: x.name, tools),
    system_message="Return a JSON with the fields response and prereqs. Response should be your short attempt at answering the question. prereqs is a mapping of fields to values, where values are the CONCRETE data that the user provides and the field names succintly describe this data.",
)

gpt = prompt | ChatOpenAI(model="gpt-4o-mini").bind_tools(tools).with_structured_output(
    SearchToolInput
)

res = gpt.invoke(agent_state).dict()

print(res)
print(SearchTool.invoke(res))

print("done")
