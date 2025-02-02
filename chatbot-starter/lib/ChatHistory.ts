type Message = {
  role: "assistant" | "user";
  content: string;
};

export class ChatHistory {
  data: Message[];

  constructor(data: Message[] = []) {
    this.data = data;
  }

  add(from: Message["role"], content: Message["content"]) {
    this.data.push({ role: from, content: content });
  }

  recent(n: number = 5) {
    return (this.data || [])
      .slice(-n)
      .map((message, i: number) => {
        return `[${i}] ${message.role}: ${message.content}`;
      })
      .join("\n");
  }
}
