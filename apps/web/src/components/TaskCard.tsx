"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ChevronRight, Clock, Layers } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { TaskDetail } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

interface TaskCardProps {
  task: TaskDetail;
}

export function TaskCard({ task }: TaskCardProps) {
  const router = useRouter();
  const latestRun = task.runs?.at(-1);
  const totalSteps = latestRun?.steps?.length ?? 0;
  const completedSteps = latestRun?.steps?.filter((s) => s.status === "COMPLETED").length ?? 0;
  const progress = totalSteps > 0 ? completedSteps / totalSteps : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      onClick={() => router.push(`/tasks/${task.id}`)}
      className="glass rounded-2xl p-5 cursor-pointer hover:bg-white/4 transition-all duration-200 group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <StatusBadge status={task.status} />
            {latestRun && task.runs && task.runs.length > 1 && (
              <span className="text-xs text-slate-500">Attempt {latestRun.attempt}</span>
            )}
          </div>
          <p className="text-sm font-medium text-slate-200 line-clamp-2 mb-3">{task.goal}</p>

          <div className="flex items-center gap-5 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
            </span>
            {totalSteps > 0 && (
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                {completedSteps}/{totalSteps} steps
              </span>
            )}
            {latestRun && (
              <span className="flex items-center gap-1.5">
                {((latestRun.tokensUsed / task.tokenBudget) * 100).toFixed(0)}% tokens used
              </span>
            )}
          </div>

          {/* Progress bar */}
          {task.status === "RUNNING" && totalSteps > 0 && (
            <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-indigo-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          )}
        </div>

        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0 mt-1" />
      </div>
    </motion.div>
  );
}
