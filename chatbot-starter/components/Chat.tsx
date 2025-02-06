"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import { useState, useEffect } from "react";
import { SendIcon } from "@/components/icons/SendIcon";
import { UserIcon } from "@/components/icons/UserIcon";
import { ChatGPTIcon } from "@/components/icons/ChatGPT";
import { useEnterSubmit } from "@/lib/hooks/useEnterSubmit";

type MessageItem =
  | { from: "user"; content: string }
  | { from: "assistant"; content: string };

const UserMessage = React.memo(({ content }: { content: string }) => {
  return (
    <div className="rounded flex flex-row space-x-2 p-2">
      <div className="rounded bg-white border drop-shadow-sm grow p-2">
        {content}
      </div>
      <div className="p-2 w-[48px]">
        <UserIcon />
      </div>
    </div>
  );
});

const AIMessage = React.memo(({ content: content }: { content: string }) => {
  return (
    <div className="rounded flex flex-row space-x-2 p-2">
      <div className="p-2 w-[48px]">
        <ChatGPTIcon />
      </div>
      <div className="markdown rounded bg-white border drop-shadow-sm grow p-2">
        <ReactMarkdown
          children={content}
          remarkPlugins={[remarkMath, remarkGfm]}
          rehypePlugins={[rehypeKatex]}
        />
      </div>
    </div>
  );
});

function processSlice(
  begin: number,
  end: number,
  text: string,
  transform: (text: string) => string,
) {
  const toProcess = text.slice(begin, end);
  return (
    text.slice(undefined, begin) +
    transform(toProcess) +
    text.slice(end, undefined)
  );
}

function processMarkdown(text: string) {
  text = text.replace(/\\\[/g, "$$$$");
  text = text.replace(/\\\]/g, "$$$$");
  text = text.replace(/\\\(/g, "$$");
  text = text.replace(/\\\)/g, "$$");
  return text;
}

async function getStream(threadId: string, assistantId: string) {
  const runThreadRequest = new Request(
    "/api/openai/thread/" + threadId + "/runs",
    {
      method: "POST",
      body: JSON.stringify({
        threadId: threadId,
        assistantId: assistantId,
        stream: true,
      }),
    },
  );

  const runThreadResponse = await fetch(runThreadRequest);
  return runThreadResponse.body;
}

async function* readStream(stream: ReadableStream) {
  const reader = stream.getReader();

  if (reader == undefined) {
    console.error("Error reading stream");
    return;
  }
  const decoder = new TextDecoder("utf-8");
  let accumulatedResponse = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    const chunk = decoder.decode(value, { stream: true });
    accumulatedResponse += chunk;
    accumulatedResponse = processSlice(
      Math.max(accumulatedResponse.length - 2 * chunk.length, 0),
      accumulatedResponse.length,
      accumulatedResponse,
      processMarkdown,
    );
    yield accumulatedResponse;
  }
}

export function Chat(props: { chatId: string }) {
  const { formRef, onKeyDown } = useEnterSubmit();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [userPrompt, setUserPrompt] = useState<string>("");
  const [threadId, setThreadId] = useState<string>("");
  const [assistantId, setAssistantId] = useState<string>("");

  useEffect(() => {
    createAssistant();
    createThread();
  }, []);

  async function createThread() {
    const newThread = new Request("/api/openai/thread", {
      method: "POST",
    });
    const response = await fetch(newThread);
    let rj = await response.json();
    setThreadId(rj.threadId);
  }

  async function createAssistant() {
    const newAssistant = new Request("/api/openai/assistants", {
      method: "POST",
    });
    const response = await fetch(newAssistant);
    let rj = await response.json();
    setAssistantId(rj.assistantId);
  }

  async function addUserMessage(content: string, threadId: string) {
    const addMessageRequest = new Request("/api/openai/thread/" + threadId, {
      method: "POST",
      body: JSON.stringify({
        id: threadId,
        role: "user",
        content: content,
        fileId: "",
      }),
    });
    await fetch(addMessageRequest);
    setMessages((messages) => [
      ...messages,
      { from: "user", content: userPrompt },
    ]);
  }

  async function addBotMessage(threadId: string, assistantId: string) {
    setMessages((messages) => [
      ...messages,
      { from: "assistant", content: "" },
    ]);

    const stream = await getStream(threadId, assistantId);

    if (!stream) {
      console.error("Failed to fetch stream");
      return;
    }
    const streamIterator = readStream(stream);
    while (true) {
      const { value, done } = await streamIterator.next();
      if (done) break;
      setMessages((messages) => [
        ...messages.slice(undefined, messages.length - 1),
        { from: "assistant", content: value },
      ]);
    }
  }

  async function submitPrompt(event: any) {
    event.preventDefault();
    await addUserMessage(userPrompt, threadId);
    setUserPrompt("");
    await addBotMessage(threadId, assistantId);
  }

  return (
    <div>
      <div className="mx-auto sm:max-w-3xl sm:px-4 space-y-2 pt-12 pb-32">
        {messages.map((message, i) => {
          if (message.from === "user") {
            return <UserMessage key={i} content={message.content} />;
          } else {
            return <AIMessage key={i} content={message.content} />;
          }
        })}
      </div>

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
                  className="min-h-[50px] w-full px-4 py-0 focus-within:outline-none rounded"
                  onKeyDown={onKeyDown}
                />
                <button
                  type="submit"
                  className="rounded pr-4 hover:text-blue-400"
                >
                  <SendIcon />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
