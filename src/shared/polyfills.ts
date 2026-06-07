type ReplaceAllFn = (searchValue: string | RegExp, replaceValue: string) => string;

const stringPrototype = String.prototype as typeof String.prototype & { replaceAll?: ReplaceAllFn };

if (typeof stringPrototype.replaceAll !== "function") {
  Object.defineProperty(String.prototype, "replaceAll", {
    configurable: true,
    writable: true,
    value(this: string, searchValue: string | RegExp, replaceValue: string) {
      const source = String(this);
      if (searchValue instanceof RegExp) {
        if (!searchValue.global) {
          throw new TypeError("String.prototype.replaceAll called with a non-global RegExp");
        }
        return source.replace(searchValue, replaceValue);
      }
      return source.split(String(searchValue)).join(String(replaceValue));
    },
  });
}

type FlatMapFn = <T, U>(
  this: T[],
  callback: (value: T, index: number, array: T[]) => U | U[],
  thisArg?: unknown,
) => U[];

const arrayPrototype = Array.prototype as unknown as { flatMap?: FlatMapFn };

if (typeof arrayPrototype.flatMap !== "function") {
  Object.defineProperty(Array.prototype, "flatMap", {
    configurable: true,
    writable: true,
    value<T, U>(this: T[], callback: (value: T, index: number, array: T[]) => U | U[], thisArg?: unknown) {
      if (typeof callback !== "function") {
        throw new TypeError("Array.prototype.flatMap callback must be a function");
      }

      const result: U[] = [];
      for (let index = 0; index < this.length; index += 1) {
        if (!(index in this)) continue;
        const mapped = callback.call(thisArg, this[index], index, this);
        if (Array.isArray(mapped)) {
          result.push(...mapped);
        } else {
          result.push(mapped);
        }
      }
      return result;
    },
  });
}
