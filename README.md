## Testing

`npm test` is supposed to be called with a Locktopus instance running on `server:9009`:

One options is to run the Locktopus server in a Docker container:

```bash
docker run -it --rm --net=locktopus --name server locktopus/locktopus
```

Then, run this test in a container with option `--net=locktopus`
