"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import { useState } from "react";
import { SendIcon } from "@/components/icons/SendIcon";
import { UserIcon } from "@/components/icons/UserIcon";
import { ChatGPTIcon } from "@/components/icons/ChatGPT";
import { useEnterSubmit } from "@/lib/hooks/useEnterSubmit";

type MessageItem =
  | { from: "USER"; content: string }
  | {
      from: "ASSISTANT";
      content: string;
    };

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

export function Chat(props: { chatId: string }) {
  const { formRef, onKeyDown } = useEnterSubmit();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [userPrompt, setUserPrompt] = useState<string>("");

  async function submitPrompt(event: any) {
    event.preventDefault();
    const request = new Request("/api/openai", {
      method: "POST",
      body: JSON.stringify({ prompt: userPrompt }),
    });
    setMessages((messages) => [
      ...messages,
      { from: "USER", content: userPrompt } as MessageItem,
    ]);
    setUserPrompt("");

    const response = await fetch(request);
    let botReply: MessageItem = {
      from: "ASSISTANT",
      content: "",
    };
    if (response.ok) {
      const jsonResponse = await response.json();
      botReply["content"] = jsonResponse["reply"];
    } else {
      console.error(`Error: ${response.status} - ${response.statusText}`);
      botReply["content"] =
        "Sorry, there was an issue processing your request.";
    }

    setMessages((messages) => [...messages, botReply]);
  }

  return (
    <div>
      <div className="mx-auto sm:max-w-3xl sm:px-4 space-y-2 pt-12 pb-32">
        {messages.map((message, i) => {
          if (message.from === "USER") {
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
