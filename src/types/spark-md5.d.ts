declare module 'spark-md5' {
  class SparkMD5 {
    static hash(str: string): string;
    static hashBinary(content: string): string;
    ArrayBuffer: {
      hash(buffer: ArrayBuffer, raw?: boolean): string;
    };
  }
  export default SparkMD5;
}
