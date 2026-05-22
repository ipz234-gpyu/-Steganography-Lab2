const PVD_SETTINGS = {
    RANGES: [
        { minVal: 0, maxVal: 7 },
        { minVal: 8, maxVal: 15 },
        { minVal: 16, maxVal: 31 },
        { minVal: 32, maxVal: 63 },
        { minVal: 64, maxVal: 127 },
        { minVal: 128, maxVal: 255 }
    ],
    METADATA_LENGTH_BYTES: 4,
    BITS_PER_UNIT: 8,
    CRITICAL_CAPACITY_LIMIT_BYTES: 10000000,
    GREYSCALE_LUMA: { redCoeff: 0.299, greenCoeff: 0.587, blueCoeff: 0.114 }
};

// 2. ФУНДАМЕНТАЛЬНІ АЛГОРИТМІЧНІ ФУНКЦІЇ PVD
function resolveIntervalMetrics(differenceValue) {
    for (const segment of PVD_SETTINGS.RANGES) {
        if (differenceValue >= segment.minVal && differenceValue <= segment.maxVal) {
            const capacityBits = Math.floor(Math.log2(segment.maxVal - segment.minVal + 1));
            return { lowerBound: segment.minVal, upperBound: segment.maxVal, bitsCount: capacityBits };
        }
    }
    throw new Error(`Значення різниці ${differenceValue} некоректне для таблиці сегментів.`);
}

function calculateOptimalAdjustment(pixel1, pixel2, dNew, dOld) {
    const errorValue = dNew - dOld;
    if (errorValue === 0) {
        return { p1Final: pixel1, p2Final: pixel2, offsetM: 0, d1: 0, d2: 0, p1Raw: pixel1, p2Raw: pixel2, finalShift: 0 };
    }

    const absError = Math.abs(errorValue);
    const decrement1 = Math.floor(absError / 2);
    const increment2 = Math.ceil(absError / 2);

    const signM = Math.sign(errorValue);
    const relativeDirection = pixel2 >= pixel1 ? 1 : -1;

    const p1RawCalculation = pixel1 - signM * relativeDirection * decrement1;
    const p2RawCalculation = pixel2 + signM * relativeDirection * increment2;

    let finalShiftValue = 0;
    const absoluteMin = Math.min(p1RawCalculation, p2RawCalculation);
    const absoluteMax = Math.max(p1RawCalculation, p2RawCalculation);

    if (absoluteMin < 0) finalShiftValue = -absoluteMin;
    if (absoluteMax > 255) finalShiftValue = 255 - absoluteMax;

    return {
        p1Final: p1RawCalculation + finalShiftValue,
        p2Final: p2RawCalculation + finalShiftValue,
        offsetM: errorValue, d1: decrement1, d2: increment2,
        p1Raw: p1RawCalculation, p2Raw: p2RawCalculation, finalShift: finalShiftValue
    };
}

function embedInSinglePixelPair(pixel1, pixel2, binaryBitString) {
    const absoluteDifference = Math.AbsTarget = Math.abs(pixel2 - pixel1);
    const segmentInfo = resolveIntervalMetrics(absoluteDifference);

    const targetedBits = binaryBitString.substring(0, Math.min(segmentInfo.bitsCount, binaryBitString.length)).padEnd(segmentInfo.bitsCount, '0');
    const embeddedValueDecimal = parseInt(targetedBits, 2);
    const calculatedNewD = segmentInfo.lowerBound + embeddedValueDecimal;

    const adjustmentResult = calculateOptimalAdjustment(pixel1, pixel2, calculatedNewD, absoluteDifference);

    return {
        p1Original: pixel1, p2Original: pixel2, currentD: absoluteDifference,
        lower: segmentInfo.lowerBound, upper: segmentInfo.upperBound, totalBits: segmentInfo.bitsCount,
        bitsInjected: targetedBits, decimalValueB: embeddedValueDecimal, newDifferenceD: calculatedNewD,
        ...adjustmentResult,
        provenD: Math.abs(adjustmentResult.p2Final - adjustmentResult.p1Final)
    };
}

function extractFromSinglePixelPair(pixel1, pixel2) {
    const absoluteDifference = Math.abs(pixel2 - pixel1);
    const segmentInfo = resolveIntervalMetrics(absoluteDifference);
    const extractedDecimalB = absoluteDifference - segmentInfo.lowerBound;
    const convertedBits = extractedDecimalB.toString(2).padStart(segmentInfo.bitsCount, '0');

    return {
        p1Stego: pixel1, p2Stego: pixel2, currentD: absoluteDifference,
        lower: segmentInfo.lowerBound, upper: segmentInfo.upperBound, totalBits: segmentInfo.bitsCount,
        decimalValueB: extractedDecimalB, binaryBits: convertedBits
    };
}

// 3. ПЕРЕДАЧА СИМВОЛІВ У БІНАРНИЙ ФОРМАТ ТА НАВПАКИ (UTF-8)
function transformStringToBitstream(plainText) {
    const stringEncoder = new TextEncoder();
    const compiledBytes = stringEncoder.encode(plainText);
    const prefixHeaderBits = compiledBytes.length.toString(2).padStart(PVD_SETTINGS.METADATA_LENGTH_BYTES * PVD_SETTINGS.BITS_PER_UNIT, '0');

    let structuredDataBits = '';
    for (let index = 0; index < compiledBytes.length; index++) {
        structuredDataBits += compiledBytes[index].toString(2).padStart(PVD_SETTINGS.BITS_PER_UNIT, '0');
    }
    return prefixHeaderBits + structuredDataBits;
}

function transformBitstreamToBytes(bitstreamString, calculatedByteSize) {
    const bufferArray = new Uint8Array(calculatedByteSize);
    for (let idx = 0; idx < calculatedByteSize; idx++) {
        const segmentedByteString = bitstreamString.substring(idx * PVD_SETTINGS.BITS_PER_UNIT, (idx + 1) * PVD_SETTINGS.BITS_PER_UNIT);
        bufferArray[idx] = parseInt(segmentedByteString, 2);
    }
    return bufferArray;
}

function convertBytesToString(rawBytesArray) {
    const stringDecoder = new TextDecoder("utf-8");
    return stringDecoder.decode(rawBytesArray);
}

// 4. МЕДІА-ПРОЦЕСИНГ ЗОБРАЖЕНЬ
function forceGrayscaleTransformation(imageBuffer) {
    const pixelMatrix = imageBuffer.data;
    for (let cursor = 0; cursor < pixelMatrix.length; cursor += 4) {
        const currentR = pixelMatrix[cursor];
        const currentG = pixelMatrix[cursor + 1];
        const currentB = pixelMatrix[cursor + 2];

        const consolidatedLuma = Math.round(
            currentR * PVD_SETTINGS.GREYSCALE_LUMA.redCoeff +
            currentG * PVD_SETTINGS.GREYSCALE_LUMA.greenCoeff +
            currentB * PVD_SETTINGS.GREYSCALE_LUMA.blueCoeff
        );

        pixelMatrix[cursor] = consolidatedLuma;
        pixelMatrix[cursor + 1] = consolidatedLuma;
        pixelMatrix[cursor + 2] = consolidatedLuma;
    }
}

function calculateTotalImageCapacity(imageBuffer) {
    const pixelMatrix = imageBuffer.data;
    const containerWidth = imageBuffer.width;
    const containerHeight = imageBuffer.height;
    let accumulatedCapacityBits = 0;

    for (let row = 0; row < containerHeight; row++) {
        for (let col = 0; col + 1 < containerWidth; col += 2) {
            const firstPixelIndex = (row * containerWidth + col) * 4;
            const secondPixelIndex = (row * containerWidth + col + 1) * 4;

            const deltaDifference = Math.abs(pixelMatrix[secondPixelIndex] - pixelMatrix[firstPixelIndex]);
            accumulatedCapacityBits += resolveIntervalMetrics(deltaDifference).bitsCount;
        }
    }
    return accumulatedCapacityBits;
}
