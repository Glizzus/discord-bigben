/**
 * The type of audio resource to play.
 */
enum AudioResourceType {
    File,
    Stream
}
export default AudioResourceType;

/**
 * Indicates the type of audio resource. This does not check if the resource exists.
 * @param audioResource the audio resource to determine the type of
 * @returns the type of audio resource
 */
export function determineType(resourceLocator: string) {
    try {
        const url = new URL(resourceLocator);
        if (url.protocol === "file:") {
            return AudioResourceType.File;
        }
        return AudioResourceType.Stream;
    } catch (error) {
        return AudioResourceType.File;
    }
}
