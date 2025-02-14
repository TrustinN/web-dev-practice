"use server";

import { OpenAI } from "openai";
import { ChatHistory } from "@/lib/ChatHistory";

export type MessageItem = { from: "user" | "assistant"; content: string };

const client = new OpenAI({
  apiKey: process.env["OPENAI_API_KEY"],
});

export const createThread = async () => {
  const newThread = await client.beta.threads.create();
  return newThread;
};

export const updateThread = async (
  id: string,
  role: "user" | "assistant",
  content: string,
  fileid?: string,
) => {
  const message: {
    role: "user" | "assistant";
    content: string;
    attachments?: { file_id: string }[];
  } = {
    role: role,
    content: content,
  };
  if (fileid !== undefined) {
    message.attachments = [{ file_id: fileid }];
  }

  await client.beta.threads.messages.create(id, message);
};

export const deleteThread = async (id: string) => {
  await client.beta.threads.del(id);
};

export const runThread = async (threadid: string, assistant: string) => {
  await client.beta.threads.runs.create(threadid, {
    assistant_id: assistant,
  });
};

export const getThreadMessages = async (threadid: string) => {
  const threadMessages = await client.beta.threads.messages.list(threadid);
  const data = threadMessages.data;
  return data.map(
    (tm): MessageItem => ({
      from: tm.role,
      content: tm.content[0].type === "text" ? tm.content[0].text.value : "",
    }),
  );
};

export const createAssistant = async (name: string) => {
  const assistant = await client.beta.assistants.create({
    name: name,
    model: "gpt-4o-mini-2024-07-18",
  });
  return assistant;
};

export async function bot(prompt: string, chatHistory: ChatHistory) {
  chatHistory.add("user", prompt);

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini-2024-07-18",
    messages: chatHistory.data,
  });

  let reply = await completion.choices[0]?.message?.content;
  reply = reply!.replace(/\\\[/g, "$$$$");
  reply = reply.replace(/\\\]/g, "$$$$");
  reply = reply.replace(/\\\(/g, "$$");
  reply = reply.replace(/\\\)/g, "$$");

  chatHistory.add("assistant", reply);

  return reply;
}
