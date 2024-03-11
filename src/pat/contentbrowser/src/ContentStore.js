import { writable, get } from "svelte/store";
import { config, cache } from "./stores";

let cfg = get(config);

// update cfg when config store changes
export const config_unsubscribe = config.subscribe((value) => {
    cfg = value;
});

export default function () {
    const store = writable([]);

    store.request = async ({
        method = "GET",
        path = null,
        uids = null,
        params = null,
        searchTerm = null,
    }) => {
        let vocabQuery;
        if (path) {
            vocabQuery = {
                criteria: [
                    {
                        i: "path",
                        o: "plone.app.querystring.operation.string.path",
                        v: `${path}::1`,
                    },
                ],
                sort_on: "getObjPositionInParent",
                sort_order: "ascending",
            };
        }
        if (uids) {
            vocabQuery = {
                criteria: [
                    {
                        i: "UID",
                        o: "plone.app.querystring.operation.list.contains",
                        v: uids,
                    },
                ],
            };
        }
        if(searchTerm) {
            vocabQuery.criteria.push({
                i: "Title",
                o: "plone.app.querystring.operation.string.contains",
                v: `${searchTerm}`,

            })
        }
        console.log(JSON.stringify(cfg));
        let url = `${cfg.vocabularyUrl}&query=${JSON.stringify(
            vocabQuery
        )}&attributes=${JSON.stringify(cfg.attributes)}&batch=${JSON.stringify({
            page: 1,
            size: 100,
        })}`;

        store.update((data) => {
            delete data.errors;
            data.loading = true;
            return data;
        });

        let headers = new Headers();
        headers.set("Accept", "application/json");
        const body = params ? JSON.stringify(params) : undefined;

        const response = await fetch(url, { method, body, headers });
        const json = await response.json();

        if (response.ok) {
            return json;
        } else {
            store.update((data) => {
                data.loading = false;
                data.errors = json.errors;
                return data;
            });
            return {};
        }
    };

    store.get = async (path, searchTerm, levelData) => {
        let parts = path.split("/") || [];
        const depth = parts.length >= cfg.maxDepth ? cfg.maxDepth : parts.length;
        let paths = [];

        let partsToShow = parts.slice(parts.length - depth, parts.length);
        let partsToHide = parts.slice(0, parts.length - depth);
        const pathPrefix = partsToHide.join("/");
        while (partsToShow.length > 0) {
            let sub_path = partsToShow.join("/");
            if (!sub_path.startsWith("/")) sub_path = "/" + sub_path;
            sub_path = pathPrefix + sub_path;
            const poped = partsToShow.pop();
            if (poped === "") sub_path = "/";
            if (paths.indexOf(sub_path) === -1) paths.push(sub_path);
        }

        let levels = [];
        let pathCounter = 0;
        for (var p of paths) {
            pathCounter++;
            const isFirstPath = pathCounter == 1;
            const skipCache = isFirstPath && searchTerm;
            let level = {};
            const c = get(cache);
            if (Object.keys(c).indexOf(p) === -1 || skipCache) {
                let query = {
                    method: "GET"
                };
                let queryPath = cfg.basePath;
                if (queryPath === "/") {
                    queryPath = "";
                }
                queryPath = queryPath + p;
                query["path"] = queryPath;
                if(isFirstPath && searchTerm){
                    query["searchTerm"] = searchTerm + "*";
                }
                level = await store.request(query);
                if(!skipCache){
                    cache.update((n) => {
                        n[p] = level;
                        return n;
                    });
                }
            } else {
                level = c[p];
            }
            level.path = p;
            level.UID = levelData?.UID;
            level.Title = levelData?.Title;
            levels = [level, ...levels];
        }
        store.set(levels);
    };

    return store;
}
