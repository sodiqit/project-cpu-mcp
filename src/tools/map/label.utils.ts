import { CellProcessKind, type CellProcessView, type CellResource, type CellState } from '../../map/types.js';
import { resourceName, type ResourceNames } from '../../utils/format.utils.js';

type LabeledResource = CellResource & { resourceName: string };

function labelResource(resources: ResourceNames, resource: CellResource): LabeledResource {
    return { ...resource, resourceName: resourceName(resources, resource.resourceId) };
}

function labelProcess(resources: ResourceNames, process: CellProcessView | null) {
    if (process === null) {
        return null;
    }
    if (process.kind === CellProcessKind.Mining) {
        return { ...process, resourceName: resourceName(resources, process.resource) };
    }
    return process;
}

export function labelCell<T extends CellState>(cell: T, resources: ResourceNames) {
    return {
        ...cell,
        resources: cell.resources.map((resource) => labelResource(resources, resource)),
        process: labelProcess(resources, cell.process),
    };
}
