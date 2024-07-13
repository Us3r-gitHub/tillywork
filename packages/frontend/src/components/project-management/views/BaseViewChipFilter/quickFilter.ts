import type { FieldFilterOption } from './types';
import { FieldTypes } from '../../fields/types';

export const quickFilterGroups = [
  'date',
  'assignee',
  'stage',
  'dropdown',
  'label',
] as const;

export type QuickFilterGroup = (typeof quickFilterGroups)[number];

const dateItems: FieldFilterOption[] = [
  {
    field: 'card.dueAt',
    operator: 'isNull',
    value: [],
    title: 'No Due Date',
    type: FieldTypes.DATE,
  },
  {
    title: 'Today',
    type: FieldTypes.DATE,
    field: 'card.dueAt',
    operator: 'between',
    value: [':startOfDay', ':endOfDay'],
  },
  {
    field: 'card.dueAt',
    operator: 'between',
    value: [':startOfTime', ':startOfDay'],
    title: 'Past Due',
    type: FieldTypes.DATE,
  },
];

const assigneeItems: FieldFilterOption[] = [
  {
    field: 'users.id',
    operator: 'isNull',
    value: [],
    title: 'No Assignee',
    type: FieldTypes.USER,
  },
];

export const defaultQuickFilterGroupedItems: Record<
  QuickFilterGroup,
  FieldFilterOption[]
> = {
  date: dateItems,
  assignee: assigneeItems,
  stage: [],
  dropdown: [],
  label: [],
};