import { useState } from "react";

import { useUiStore } from "../store/ui";
import { ManualAddTab } from "./addjob/ManualAddTab";
import { MarkdownAddTab } from "./addjob/MarkdownAddTab";
import { LookupAddTab } from "./addjob/LookupAddTab";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Mode = "manual" | "markdown" | "lookup";

const TAB_LABEL: Record<Mode, string> = {
  manual: "Manual",
  markdown: "Markdown / CSV",
  lookup: "Lookup roles",
};

export function AddJobModal() {
  const open = useUiStore((s) => s.addJobOpen);
  const setOpen = useUiStore((s) => s.setAddJobOpen);
  const [mode, setMode] = useState<Mode>("manual");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add a job</DialogTitle>
          <DialogDescription>
            Paste a role manually, ingest a markdown / CSV dump, or look up new
            roles.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
          <TabsList variant="line" className="border-b border-border">
            {(Object.keys(TAB_LABEL) as Mode[]).map((id) => (
              <TabsTrigger key={id} value={id} variant="line">
                {TAB_LABEL[id]}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="mt-4 max-h-[60vh] overflow-y-auto pr-1">
            <TabsContent value="manual">
              <ManualAddTab />
            </TabsContent>
            <TabsContent value="markdown">
              <MarkdownAddTab />
            </TabsContent>
            <TabsContent value="lookup">
              <LookupAddTab />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
