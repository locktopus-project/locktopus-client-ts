# JS Client for Locktopus

This is a client for [Locktopus](https://github.com/locktopus-project/locktopus-server). Written in Typescript.

It is supposed to be used in Node.js, though is also compatible with the browser.

## Installation

```bash
npm install locktopus-client
```

## Testing

`npm test` is supposed to be called with a Locktopus instance running on `server:9009`:

One options is to run the Locktopus server in a Docker container:

```bash
docker run -it --rm --net=locktopus --name server locktopus/locktopus
```

Then, run this test in a container with option `--net=locktopus`

## Contribution

Feel free to open issues for any reason or contact the maintainer directly.

## License

The software is published under MIT [LICENCE](./LICENCE)
