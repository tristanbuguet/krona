"use client";

import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { GripVertical, Search, Settings2, RefreshCcw } from "lucide-react";
import { motion } from "framer-motion";

type Merchant = {
  id: string;
  name: string;
  isSubscription: boolean;
  amount: number;
};

export function SubscriptionManager({ transactions, onUpdate }: { transactions: any[], onUpdate: (merchantName: string, isSub: boolean) => void }) {
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [merchants, setMerchants] = useState<Merchant[]>([]);

  useEffect(() => {
    setMounted(true);
    const map = new Map<string, Merchant>();
    transactions.forEach(tx => {
       if (!map.has(tx.name) && tx.amount < 0) { // Only track expenses for subscriptions
         map.set(tx.name, { id: tx.name, name: tx.name, isSubscription: tx.isSubscription || false, amount: tx.amount });
       }
    });
    setMerchants(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
  }, [transactions]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    
    if (source.droppableId !== destination.droppableId) {
      const isSub = destination.droppableId === "subs";
      setMerchants(prev => prev.map(m => m.id === draggableId ? { ...m, isSubscription: isSub } : m));
      onUpdate(draggableId, isSub);
    } else {
      const isSubList = source.droppableId === "subs";
      const listToReorder = merchants.filter(m => m.isSubscription === isSubList);
      const otherList = merchants.filter(m => m.isSubscription !== isSubList);
      
      const [reorderedItem] = listToReorder.splice(source.index, 1);
      listToReorder.splice(destination.index, 0, reorderedItem);
      
      setMerchants([...listToReorder, ...otherList]);
    }
  };

  if (!mounted) return null;

  const subsList = merchants.filter(m => m.isSubscription);
  const otherList = merchants.filter(m => !m.isSubscription && m.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full min-h-0">
        
        {/* Colonne Subs */}
        <div className="flex flex-col h-full min-h-0">
           <div className="flex items-center gap-2 mb-4 shrink-0">
             <RefreshCcw size={16} className="text-foreground" />
             <h2 className="font-semibold text-foreground">Abonnements actifs</h2>
             <span className="bg-neutral-100 dark:bg-neutral-800 text-xs font-bold px-2 py-0.5 rounded-full text-muted-foreground">{subsList.length}</span>
           </div>
           
           <Droppable droppableId="subs">
             {(provided, snapshot) => (
               <div 
                 {...provided.droppableProps} 
                 ref={provided.innerRef}
                 className={`flex-1 rounded-2xl border border-dashed transition-colors p-4 overflow-y-auto no-scrollbar ${snapshot.isDraggingOver ? 'bg-neutral-100 dark:bg-neutral-800 border-neutral-400' : 'border-neutral-300 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30'}`}
               >
                 {subsList.map((m, index) => (
                   <Draggable key={m.id} draggableId={m.id} index={index}>
                     {(provided, snapshot) => (
                       <motion.div
                         ref={provided.innerRef}
                         {...provided.draggableProps}
                         {...(provided.dragHandleProps as any)}
                         whileHover={{ scale: 1.01 }}
                         className={`mb-2 p-3 bg-white dark:bg-[#0E0E0E] border rounded-xl flex justify-between items-center select-none ${snapshot.isDragging ? 'shadow-lg border-neutral-300 dark:border-white/20' : 'border-neutral-200/70 dark:border-white/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.03)]'}`}
                       >
                         <div className="flex items-center gap-3">
                           <GripVertical size={16} className="text-muted-foreground/50 cursor-grab active:cursor-grabbing" />
                           <span className="font-semibold text-sm text-foreground">{m.name}</span>
                         </div>
                         <span className="text-xs font-bold text-foreground">
                            {Math.abs(m.amount).toFixed(2)} €
                         </span>
                       </motion.div>
                     )}
                   </Draggable>
                 ))}
                 {provided.placeholder}
               </div>
             )}
           </Droppable>
        </div>

        {/* Colonne Dépenses Courantes */}
        <div className="flex flex-col h-full min-h-0">
           <div className="flex items-center justify-between gap-2 mb-4 shrink-0">
             <div className="flex items-center gap-2">
               <Settings2 size={16} className="text-foreground" />
               <h2 className="font-semibold text-foreground">Dépenses courantes</h2>
               <span className="bg-neutral-100 dark:bg-neutral-800 text-xs font-bold px-2 py-0.5 rounded-full text-muted-foreground">{otherList.length}</span>
             </div>
             
             <div className="relative">
               <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
               <input 
                 type="text" 
                 placeholder="Rechercher..." 
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 className="pl-8 pr-3 py-1.5 text-sm bg-card border border-border rounded-full focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600 transition-colors w-40 text-foreground"
               />
             </div>
           </div>
           
           <Droppable droppableId="other">
             {(provided, snapshot) => (
               <div 
                 {...provided.droppableProps} 
                 ref={provided.innerRef}
                 className={`flex-1 rounded-2xl border border-dashed transition-colors p-4 overflow-y-auto no-scrollbar ${snapshot.isDraggingOver ? 'bg-neutral-100 dark:bg-neutral-800 border-neutral-400' : 'border-neutral-300 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30'}`}
               >
                 {otherList.map((m, index) => (
                   <Draggable key={m.id} draggableId={m.id} index={index}>
                     {(provided, snapshot) => (
                       <motion.div
                         ref={provided.innerRef}
                         {...provided.draggableProps}
                         {...(provided.dragHandleProps as any)}
                         whileHover={{ scale: 1.01 }}
                         className={`mb-2 p-3 bg-white dark:bg-[#0E0E0E] border rounded-xl flex justify-between items-center select-none ${snapshot.isDragging ? 'shadow-lg border-neutral-300 dark:border-white/20' : 'border-neutral-200/70 dark:border-white/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.03)]'}`}
                       >
                         <div className="flex items-center gap-3">
                           <GripVertical size={16} className="text-muted-foreground/50 cursor-grab active:cursor-grabbing" />
                           <span className="font-medium text-sm text-foreground">{m.name}</span>
                         </div>
                         <span className="text-xs font-medium text-muted-foreground">
                            {Math.abs(m.amount).toFixed(2)} €
                         </span>
                       </motion.div>
                     )}
                   </Draggable>
                 ))}
                 {provided.placeholder}
               </div>
             )}
           </Droppable>
        </div>

      </div>
    </DragDropContext>
  );
}
