import { writable, get } from "svelte/store";
import { request } from "./utils.js";

export default function (config, pathCache) {
    const store = writable([]);

    const load = async (query) => {
        let defaults = {
            vocabularyUrl: config.vocabularyUrl,
            attributes: config.attributes,
            pageSize: config.pageSize,
            browseableTypes: config.browseableTypes,
            searchIndex: config.searchIndex,
        };
        query = {
            ...defaults,
            ...query,
        }
        if (config.selectableTypes.length) {
            query["selectableTypes"] = config.selectableTypes;
        }
        try {
            return await request(query);
        }
        catch {
            return {
                "error": "Could load data from backend."
            };
        }
    }

    const browse = async (path, searchTerm, updateCache) => {

        let rootPath = config.rootPath;
        let rootPathParts = rootPath.replace(/^\/+/, '').split("/");
        let physicalPath = path;
        let hideRootPath = rootPath;

        if (!physicalPath.startsWith(rootPath)) {
            // The path from the returned items from "vocabularyUrl" are starting
            // relative from the Plone Site. So we need to generate the phyiscalPath here.
            // NOTE: We also have to merge the rootPath and the clicked path correctly for example:
            // rootPath: /path/to/plonesite/media, clicked path: /media/subfolder
            // has to become:
            // /path/to/plonesite/media/subfolder
            let pathParts = physicalPath.replace(/^\/+/, '').split("/");
            let overlapIdx = 0;
            for (overlapIdx; overlapIdx < rootPathParts.length; overlapIdx++) {
                if (rootPathParts[overlapIdx] === pathParts[0]) {
                    break;
                }
            }
            hideRootPath = "/" + (rootPathParts.filter(it => !pathParts.includes(it))).join("/");
            physicalPath = "/" + (rootPathParts.slice(0, overlapIdx).concat(pathParts)).join("/");
        }

        let paths = [];
        let parts = physicalPath.split("/") || [];
        const maxDepth = Math.min(parts.length, config.maxDepth || 999);

        let partsToShow = parts.slice(parts.length - maxDepth, parts.length);
        let partsToHide = parts.slice(0, parts.length - maxDepth);
        const pathPrefix = partsToHide.join("/");

        while (partsToShow.length > 0) {
            let sub_path = partsToShow.join("/").replace(/^\//, "");
            const poped = partsToShow.pop();
            sub_path = pathPrefix + ((poped != "") ? `/${sub_path}` : "");
            if (sub_path && paths.indexOf(sub_path) === -1) paths.push(sub_path);
            if (sub_path == rootPath) {
                // respect rootPath
                break;
            }
        }

        const pC = get(pathCache);
        let levels = [];
        let pathCounter = 0;

        for (var p of paths) {
            pathCounter++;
            const isFirstPath = pathCounter == 1;
            let level = {};
            if (
                !(p in pC) ||  // new path not found in cache
                (isFirstPath && searchTerm) ||  // filtering the level
                (isFirstPath && updateCache)  // manual cache update request
            ) {
                let query = {
                    path: p,
                };

                if (isFirstPath && searchTerm) {
                    query["searchTerm"] = "*" + searchTerm + "*";
                }

                level = await load(query);

                // check if there is more than the current batch
                level.load_more = config.pageSize < level.total;
                level.page = 1;
                level.path = p;
                level.searchTerm = searchTerm;
                level.displayPath = p.replace(new RegExp(`^(${hideRootPath}|${rootPath})`), "") || "/"

                if(searchTerm === "") {
                    // get level info
                    const levelInfo = await load({
                        levelInfoPath: p,
                    });
                    if (levelInfo.total) {
                        level.UID = levelInfo.results[0].UID;
                        level.Title = levelInfo.results[0].Title;
                        level.portal_type = levelInfo.results[0].portal_type;
                        level.getIcon = levelInfo.results[0].getIcon;
                        // check if level is selectable (config.selectableTypes)
                        level.selectable = (!config.selectableTypes.length || config.selectableTypes.indexOf(levelInfo.results[0].portal_type) != -1);
                    }
                }

                // persist showFilter value from previously cached path
                if (p in pC) {
                    level.showFilter = pC[p].showFilter || level.showFilter;
                }

                pathCache.update((n) => {
                    n[p] = level;
                    return n;
                });
            } else {
                level = pC[p];
            }
            levels = [level, ...levels];
        }
        store.set(levels);
    }

    const search = async (searchTerm, page) => {
        let query = {
            searchPath: config.rootPath,
            page: page,
        };
        if (searchTerm) {
            query["searchTerm"] = "*" + searchTerm + "*";
        }

        let level = await load(query);
        level.searchTerm = searchTerm
        const has_more = (page * config.pageSize) < level.total;

        store.update((levels) => {

            // first time or new search
            if (levels.length == 0 || levels[0].searchTerm != searchTerm) {
                level.load_more = has_more;
                level.selectable = false;
                level.page = page
                return [level,];
            }

            // has more ?
            levels[0].load_more = has_more;
            levels[0].page = page;

            // append new batch
            levels[0].results = [
                ...levels[0].results,
                ...level.results,
            ];
            return levels;
        });
    }

    const nextBatch = async (p, page, searchTerm) => {
        let query = {
            path: p,
            page: page,
        };

        if (searchTerm) {
            query["searchTerm"] = "*" + searchTerm + "*";
        }

        let level = await load(query);

        store.update((levels) => {
            levels.forEach((l) => {
                if (l.path != p) {
                    return l;
                }
                l.page = page;
                l.load_more = (page * config.pageSize) < level.total;
                l.results = [
                    ...l.results,
                    ...level.results,
                ]
            });
            return levels;
        });
    }

    store.get = async ({
        path = "",
        searchTerm = "",
        updateCache = false,
        loadMorePath = "",
        page = 1,
        mode = null,
    }) => {
        if (mode == null) {
            mode = config.mode;
        }
        if (mode === "search") {
            await search(searchTerm, page);
        } else if (loadMorePath) {
            const pC = get(pathCache);
            // get path from previously loaded cache
            let level = pC[loadMorePath];
            if (page > level.page) {
                await nextBatch(loadMorePath, page, searchTerm);
            }
        } else if (path) {
            await browse(path, searchTerm, updateCache);
        }

    };

    return store;
}
