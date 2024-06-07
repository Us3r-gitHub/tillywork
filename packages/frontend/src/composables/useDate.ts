import dayjs from 'dayjs';
import isToday from 'dayjs/plugin/isToday';
import isTomorrow from 'dayjs/plugin/isTomorrow';
import isYesterday from 'dayjs/plugin/isYesterday';
import relativeTime from 'dayjs/plugin/relativeTime';
import utc from 'dayjs/plugin/utc';

export const useDate = () => {
  dayjs.extend(relativeTime);
  dayjs.extend(isYesterday);
  dayjs.extend(isToday);
  dayjs.extend(isTomorrow);
  dayjs.extend(utc);

  return {
    dayjs,
  };
};
