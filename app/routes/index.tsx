import { createFileRoute } from "@tanstack/react-router";

import {
  InfiniteData,
  infiniteQueryOptions,
  QueryClient,
  useMutation,
  useQueryClient,
  useSuspenseInfiniteQuery,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/start";
import { useState } from "react";
import {
  createNewMessage,
  listMessages,
  ListMessagesResponse,
} from "~/dataset";

export const createNewMessageFn = createServerFn("POST", createNewMessage);

export const listMessagesFn = createServerFn("GET", listMessages);

export const listMessagesQuery = ({
  queryClient,
  ...input
}: { queryClient: QueryClient } & Pick<
  Parameters<typeof listMessagesFn>[0],
  "cursor"
>) => {
  const queryKey = ["messages", input] as const;

  type PageParam = Parameters<typeof listMessagesFn>[0]["cursor"];

  return infiniteQueryOptions({
    queryKey: queryKey,
    queryFn: async ({ pageParam, signal }) => {
      const allData = queryClient.getQueryData(queryKey) as InfiniteData<
        ListMessagesResponse,
        PageParam
      >;

      const existingData = allData?.pages.find(
        (_, index) =>
          allData?.pageParams[index]?.id === pageParam?.id &&
          allData?.pageParams[index]?.sentAt === pageParam?.sentAt &&
          allData?.pageParams[index]?.direction === pageParam?.direction,
      );

      if (existingData !== undefined && existingData.prev !== null) {
        return existingData;
      }

      const result = await listMessagesFn(
        {
          ...input,
          cursor: existingData?.cursor ?? pageParam ?? null,
        },
        { requestInit: { signal } },
      );

      return result;
    },
    initialPageParam: input.cursor as PageParam,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    getPreviousPageParam: (firstPage) => firstPage.prev ?? undefined,
  });
};

export const Route = createFileRoute("/")({
  component: Page,
});

function Page() {
  const [cursor, setCursor] = useState<{
    direction: "asc";
    sentAt: string;
    id: string;
  } | null>(null);

  const queryClient = useQueryClient();

  const query = useSuspenseInfiniteQuery({
    ...listMessagesQuery({ queryClient, cursor }),
    maxPages: 3,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const create = useMutation({
    mutationFn: createNewMessageFn,
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
            setCursor(id !== null ? JSON.parse(id) : undefined);
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
          return page.data.map((message) => {
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
