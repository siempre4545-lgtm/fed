import { inflateRawSync } from "zlib";

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_DIR_HEADER = 0x02014b50;
const DATA_DESCRIPTOR = 0x08074b50;

const readUInt32 = (buffer: Buffer, offset: number) => buffer.readUInt32LE(offset);
const readUInt16 = (buffer: Buffer, offset: number) => buffer.readUInt16LE(offset);

const findNextSignature = (buffer: Buffer, start: number, signature: number) => {
  for (let i = start; i <= buffer.length - 4; i += 1) {
    if (readUInt32(buffer, i) === signature) return i;
  }
  return -1;
};

const extractEntryData = (buffer: Buffer, offset: number) => {
  const flags = readUInt16(buffer, offset + 6);
  const compression = readUInt16(buffer, offset + 8);
  const compressedSize = readUInt32(buffer, offset + 18);
  const fileNameLength = readUInt16(buffer, offset + 26);
  const extraLength = readUInt16(buffer, offset + 28);
  const nameStart = offset + 30;
  const nameEnd = nameStart + fileNameLength;
  const fileName = buffer.slice(nameStart, nameEnd).toString("utf-8");
  const dataStart = nameEnd + extraLength;

  let dataEnd = dataStart + compressedSize;
  if (flags & 0x08 || compressedSize === 0) {
    const nextLocal = findNextSignature(buffer, dataStart + 4, LOCAL_FILE_HEADER);
    const nextCentral = findNextSignature(buffer, dataStart + 4, CENTRAL_DIR_HEADER);
    const nextDescriptor = findNextSignature(buffer, dataStart + 4, DATA_DESCRIPTOR);
    const candidates = [nextLocal, nextCentral, nextDescriptor].filter((value) => value !== -1);
    if (candidates.length > 0) {
      dataEnd = Math.min(...candidates);
    } else {
      dataEnd = buffer.length;
    }
  }

  const data = buffer.slice(dataStart, dataEnd);
  return { fileName, compression, data, nextOffset: dataEnd };
};

export const extractFirstXmlFromZip = (buffer: Buffer) => {
  let offset = findNextSignature(buffer, 0, LOCAL_FILE_HEADER);
  while (offset !== -1 && offset < buffer.length) {
    const entry = extractEntryData(buffer, offset);
    const fileName = entry.fileName.toLowerCase();
    if (fileName.endsWith(".xml")) {
      if (entry.compression === 0) {
        return entry.data.toString("utf-8");
      }
      if (entry.compression === 8) {
        const inflated = inflateRawSync(entry.data);
        return inflated.toString("utf-8");
      }
    }
    offset = findNextSignature(buffer, entry.nextOffset, LOCAL_FILE_HEADER);
  }
  return null;
};
