import logging

import uvicorn
from fastapi import FastAPI
from graph import grph
from langchain_core.messages import HumanMessage

app = FastAPI()
logger = logging.getLogger("uvicorn.error")


@app.post("/workflow")
def run_graph(prompt: str):
    response = grph.invoke(
        {"messages": [HumanMessage(content=prompt)], "prereqs": {}, "sender": ""},
        {"recursion_limit": 150},
    )
    # logger.error(response)

    messages = response["messages"]
    prereqs = response["prereqs"]
    last_msg = messages[-1]
    return {"content": last_msg, "form_data": prereqs}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
