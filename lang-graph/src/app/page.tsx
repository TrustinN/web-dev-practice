"use client";

import { Chat } from "@/components/Chat";
import { randomString } from "@/lib/randomString";
import { FormRequest } from "@/components/FormRequest";

// const fields = ["location", "time", "day"];
//       <FormRequest fields={fields} />
export default function Home() {
  return (
    <main>
      <Chat chatId={randomString(32)} />
    </main>
  );
}
