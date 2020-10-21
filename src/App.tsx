import React, { memo, useState } from "react";
import "./App.css";
import { map, scan, startWith, takeWhile } from "rxjs/operators";
import { combineLatest, GroupedObservable, Observable, Subject } from "rxjs";
import { collectValues, mergeWithKey, split } from "@react-rxjs/utils";
import { bind, shareLatest } from "@react-rxjs/core";

// Create a single stream for all the user events
const newTodo$ = new Subject<string>();
export const onNewTodo = (text: string) => text && newTodo$.next(text);

const editTodo$ = new Subject<{ id: number; text: string }>();
export const onEditTodo = (id: number, text: string) =>
  editTodo$.next({ id, text });

const toggleTodo$ = new Subject<number>();
export const onToggleTodo = (id: number) => toggleTodo$.next(id);

const deleteTodo$ = new Subject<number>();
export const onDeleteTodo = (id: number) => deleteTodo$.next(id);

const todoAction$ = mergeWithKey({
  add: newTodo$.pipe(map((text, id) => ({ id, text }))),
  edit: editTodo$,
  toggle: toggleTodo$.pipe(map((id) => ({ id }))),
  delete: deleteTodo$.pipe(map((id) => ({ id }))),
});

// Create a stream for each todo
type Todo = { id: number; text: string; done: boolean };
const todos$: Observable<GroupedObservable<number, Todo>> = todoAction$.pipe(
  split(
    (event) => event.payload.id,
    (event$, id) =>
      event$.pipe(
        takeWhile((event) => event.type !== "delete"),
        scan(
          (state, action) => {
            switch (action.type) {
              case "add":
              case "edit":
                return { ...state, text: action.payload.text };
              case "toggle":
                return { ...state, done: !state.done };
              default:
                return state;
            }
          },
          { id, text: "", done: false } as Todo
        )
      )
  )
);

// Collect the GroupedObservable
const todosMap$: Observable<Map<number, Todo>> = todos$.pipe(collectValues());

// Adding filter
enum FilterType {
  All = "all",
  Done = "done",
  Pending = "pending",
}
const selectFilter$ = new Subject<FilterType>();
export const onSelectFilter = (type: FilterType) => {
  selectFilter$.next(type);
};

const [useCurrentFilter, currentFilter$] = bind(
  selectFilter$.pipe(startWith(FilterType.All))
);

// Todo component
const todosList$ = todosMap$.pipe(
  map((todosMap) => [...todosMap.values()]),
  shareLatest() // We are using shareLatest because the stats will also consume it
);

const [useTodos] = bind(
  combineLatest(todosList$, currentFilter$).pipe(
    map(([todos, currentFilter]) => {
      if (currentFilter === FilterType.All) {
        return todos;
      }

      const isDone = currentFilter === FilterType.Done;
      return todos.filter((todo) => todo.done === isDone);
    })
  )
);

function TodoItemCreator() {
  const [inputValue, setInputValue] = useState("");

  const addItem = () => {
    onNewTodo(inputValue);
    setInputValue("");
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  return (
    <div>
      <input type="text" value={inputValue} onChange={onChange} />
      <button onClick={addItem}>Add</button>
    </div>
  );
}

const TodoItem = memo(({ item }: { item: Todo }) => {
  const editItemText = (e: React.ChangeEvent<HTMLInputElement>) => {
    onEditTodo(item.id, e.target.value);
  };

  const toggleItemCompletion = () => {
    onToggleTodo(item.id);
  };

  const deleteItem = () => {
    onDeleteTodo(item.id);
  };

  return (
    <div>
      <input type="text" value={item.text} onChange={editItemText} />
      <input
        type="checkbox"
        checked={item.done}
        onChange={toggleItemCompletion}
      />
      <button onClick={deleteItem}>X</button>
    </div>
  );
});

// Filter component
function TodoListFilters() {
  const filter = useCurrentFilter();

  const updateFilter = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value: FilterType = e.target.value as FilterType;
    onSelectFilter(value);
  };

  return (
    <>
      Filter:
      <select value={filter} onChange={updateFilter}>
        <option value={FilterType.All}>All</option>
        <option value={FilterType.Done}>Completed</option>
        <option value={FilterType.Pending}>Uncompleted</option>
      </select>
    </>
  );
}

// Stats
const [useTodosStats] = bind(
  todosList$.pipe(
    map((todosList) => {
      const nTotal = todosList.length;
      const nCompleted = todosList.filter((item) => item.done).length;
      const nUncompleted = nTotal - nCompleted;
      const percentCompleted =
        nTotal === 0 ? 0 : Math.round((nCompleted / nTotal) * 100);

      return {
        nTotal,
        nCompleted,
        nUncompleted,
        percentCompleted,
      };
    })
  )
);
function TodoListStats() {
  const {
    nTotal,
    nCompleted,
    nUncompleted,
    percentCompleted,
  } = useTodosStats();

  return (
    <ul>
      <li>Total items: {nTotal}</li>
      <li>Items completed: {nCompleted}</li>
      <li>Items not completed: {nUncompleted}</li>
      <li>Percent completed: {percentCompleted}</li>
    </ul>
  );
}

function App() {
  const todoList = useTodos();

  return (
    <div className="App">
      <TodoListStats />
      <TodoListFilters />
      <TodoItemCreator />
      {todoList.map((todoItem) => (
        <TodoItem key={todoItem.id} item={todoItem} />
      ))}
    </div>
  );
}

export default App;
