import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/start";

import { faker } from "@faker-js/faker";
import * as uuid from "uuid";
import {
  InfiniteData,
  infiniteQueryOptions,
  QueryClient,
  useMutation,
  useQueryClient,
  useSuspenseInfiniteQuery,
} from "@tanstack/react-query";
import { useState } from "react";

function createMockMessage(index: number) {
  return {
    id: uuid.v4(),
    index,
    sentAt: new Date(
      new Date("2024-09-10T15:28:35.160Z").getTime() +
        index * 60 * 60 * 1 * 1000,
    ).toISOString(),
    content: faker.lorem.lines(),
  };
}

type Message = ReturnType<typeof createMockMessage>;

const MESSAGES: Message[] = Array.from({ length: 1000 }, (_, i) =>
  createMockMessage(i),
);

const createNewMessage = createServerFn("POST", async () => {
  MESSAGES.push(createMockMessage(MESSAGES.length));
});

const listMessages = createServerFn(
  "GET",
  async (input: { direction: "desc" | "asc"; cursor?: string }) => {
    const LIMIT = 20;

    let messages = MESSAGES;

    // ORDER BY sent_at (DESC | ASC), id (ASC | DESC)

    switch (input.direction) {
      case "asc": {
        messages = messages.sort((a, b) => {
          // Sort by sentAt in descending order, then id in ascending order.

          if (new Date(a.sentAt).getTime() === new Date(b.sentAt).getTime()) {
            return a.id.localeCompare(b.id);
          }

          return new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime();
        });
        break;
      }
      case "desc": {
        messages = messages.sort((a, b) => {
          // Sort by sentAt in ascending, then id in descending order.

          if (new Date(a.sentAt).getTime() === new Date(b.sentAt).getTime()) {
            return b.id.localeCompare(a.id);
          }

          return new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime();
        });
        break;
      }
    }

    // WHERE id = $cursor

    let start = 0;
    let end = Math.min(start + LIMIT, messages.length);

    if (input.cursor !== undefined) {
      for (
        start = start;
        start < messages.length;
        start++, end = Math.min(start + LIMIT, messages.length)
      ) {
        if (messages[start]?.id === input.cursor) {
          break;
        }
      }
    }

    let cursor = messages[start]?.id;

    // SELECT lead(id, $page_size) OVER () AS next FROM ordered_filtered_messages LIMIT 1;
    let next = messages[end]?.id ?? null;

    // SELECT lag(id, 1) OVER () AS previous FROM ordered_filtered_messages LIMIT 1;
    let previous = messages[start - 1]?.id ?? null;

    messages = messages.slice(start, end);
    if (input.direction === "desc") {
      [next, previous] = [previous, next];
      messages = messages.reverse();
    }

    return {
      data: messages,
      start,
      end,
      cursor,
      next,
      previous,
    };
  },
);

type ListMessagesResponse = Awaited<ReturnType<typeof listMessages>>;

const listMessagesQuery = ({
  queryClient,
  ...input
}: { queryClient: QueryClient } & Pick<
  Parameters<typeof listMessages>[0],
  "cursor"
>) => {
  const queryKey = ["messages", input] as const;

  type PageParam = Pick<
    Parameters<typeof listMessages>[0],
    "cursor" | "direction"
  >;

  return infiniteQueryOptions({
    queryKey: queryKey,
    queryFn: async ({ pageParam, signal }) => {
      const allData = queryClient.getQueryData(queryKey) as InfiniteData<
        ListMessagesResponse,
        PageParam
      >;

      const existingData = allData?.pages.find(
        (_, index) =>
          allData?.pageParams[index]?.cursor === pageParam.cursor &&
          allData?.pageParams[index]?.direction === pageParam.direction,
      );

      if (existingData !== undefined && existingData.previous !== null) {
        return existingData;
      }

      const result = await listMessages(
        {
          ...input,
          direction: pageParam.direction,
          cursor: pageParam.cursor ?? existingData?.cursor,
        },
        { requestInit: { signal } },
      );

      return result;
    },
    initialPageParam: { direction: "asc", cursor: input.cursor } as PageParam,
    getNextPageParam: (lastPage) => {
      if (lastPage.next === null) {
        return;
      }
      return { direction: "asc" as const, cursor: lastPage.next };
    },
    getPreviousPageParam: (firstPage) => {
      if (firstPage.previous === null) {
        return;
      }

      return { direction: "desc" as const, cursor: firstPage.previous };
    },
  });
};

export const Route = createFileRoute("/")({
  component: Page,
});

function Page() {
  const [cursor, setCursor] = useState<string | undefined>();

  const queryClient = useQueryClient();

  const query = useSuspenseInfiniteQuery({
    ...listMessagesQuery({ queryClient, cursor }),
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const create = useMutation({
    mutationFn: createNewMessage,
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: listMessagesQuery({ queryClient, cursor }).queryKey,
        exact: true,
      });
    },
  });

  return (
    <div className="space-y-4 p-4">
      <div className="text-4xl font-bold">Bidirectional</div>

      <div className="flex gap-4">
        <button
          className="block rounded-lg bg-black px-2 py-1 text-sm text-white"
          onClick={() => {
            const id = prompt("enter a message id to offset by");
            setCursor(id !== null ? id : undefined);
          }}
        >
          offset by id
        </button>

        <button
          className="block rounded-lg bg-black px-2 py-1 text-sm text-white"
          onClick={() => {
            if (!create.isPending) {
              create.mutate(undefined);
            }
          }}
        >
          create new message
        </button>
      </div>

      <button
        disabled={!query.hasPreviousPage || query.isFetchingPreviousPage}
        className="block w-full bg-black px-2 py-1 text-white disabled:opacity-50"
        onClick={() => {
          if (query.hasPreviousPage && !query.isFetchingPreviousPage) {
            query.fetchPreviousPage();
          }
        }}
      >
        Previous
      </button>

      <div className="divide-y border text-xs">
        {query.data.pages.map((page, i) => {
          return page.data.map((message: Message) => {
            return (
              <div key={message.id} className="p-1">
                <div>
                  (Page {i + 1}) <code>{JSON.stringify(message)}</code>
                </div>
              </div>
            );
          });
        })}
      </div>
      <button
        disabled={!query.hasNextPage || query.isFetchingNextPage}
        className="block w-full bg-black px-2 py-1 text-white disabled:opacity-50"
        onClick={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) {
            query.fetchNextPage();
          }
        }}
      >
        Next
      </button>
    </div>
  );
}
