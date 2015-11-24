var fs = require('fs');
var path = require('path');
var SparqlClient = require('sparql-client');
var async = require('async');
var xml2js = require('xml2js');

// TGN configuration
var sparqlFiles = [
  'tgn-parents',
  'tgn-places',
  'tgn-terms'
];

var types = {
  nations: 'hg:Country',
  area: 'hg:Area',
  canals: 'hg:Water',
  channels: 'hg:Water',
  'general regions': 'hg:Region',
  'inhabited places': 'hg:Place',
  provinces: 'hg:Province',
  'second level subdivisions': 'hg:Region',
  neighborhoods: 'hg:Neighbourhood'
};

var sparqlEndpoint = 'http://vocab.getty.edu/sparql.rdf';

function download(config, dir, writer, callback) {
  async.eachSeries(sparqlFiles, function(sparqlFile, callback) {
    async.eachSeries(config.parents, function(parent, callback) {
      var client = new SparqlClient(sparqlEndpoint);
      var sparqlQuery = fs.readFileSync(path.join(__dirname, 'sparql', sparqlFile + '.sparql'), 'utf8');

      sparqlQuery = sparqlQuery.replace(new RegExp('{{ parent }}', 'g'), parent);

      client.query(sparqlQuery)
        .execute(function(error, results) {
          fs.writeFileSync(path.join(dir, sparqlFile + '.' +  parent.replace('tgn:', '') + '.xml'), results);
          callback();
        });
    },

    function(err) {
      callback(err);
    });
  },

  function(err) {
    callback(err);
  });
}

function convert(config, dir, writer, callback) {
  var parser = new xml2js.Parser();

  async.eachSeries(sparqlFiles, function(sparqlFile, callback) {
    async.eachSeries(config.parents, function(parent, callback) {

      fs.readFile(path.join(dir, sparqlFile + '.' + parent.replace('tgn:', '') + '.xml'), function(err, data) {
        parser.parseString(data, function(err, result) {
          async.eachSeries(result['rdf:RDF']['rdf:Description'], function(element, callback) {
            parseElement(element, function(err) {
              callback(err);
            });
          },

          function(err) {
            callback(err);
          });

        });
      });

    },

    function(err) {
      callback(err);
    });
  },

  function(err) {
    callback(err);
  });

  function getElementTagValue(element, tag) {
    if (element[tag] && element[tag].length > 0 && element[tag][0]._) {
      return element[tag][0]._;
    } else if (element[tag] && element[tag].length > 0) {
      return element[tag][0];
    }

    return null;
  }

  function getElementTagAttribute(element, tag, attribute) {
    if (element[tag] && element[tag].length > 0 && element[tag][0].$ && element[tag][0].$[attribute]) {
      return element[tag][0].$[attribute];
    }

    return null;
  }

  function parseElement(element, callback) {
    var elementType = getElementTagValue(element, 'tgn:typeTerm');
    var type = types[elementType];

    // Only process elements with valid type
    if (type) {
      var data = [];

      var name = getElementTagValue(element, 'gvp:term');
      var uri = getElementTagAttribute(element, 'dct:source', 'rdf:resource');

      var pit = {
        uri: uri,
        name: name,
        type: type,
        data: {
          type: elementType
        }
      };

      var long = getElementTagValue(element, 'wgs:long');
      var lat = getElementTagValue(element, 'wgs:lat');
      if (long && lat) {
        pit.geometry = {
          type: 'Point',
          coordinates: [
            parseFloat(long),
            parseFloat(lat)
          ]
        };
      }

      var comment = getElementTagValue(element, 'rdfs:comment');
      if (comment) {
        pit.data.comment = comment;
      }

      // TODO: use just years, and specify fuzziness!
      var estStart = getElementTagValue(element, 'gvp:estStart');
      var estEnd = getElementTagValue(element, 'gvp:estEnd');
      if (estStart) {
        pit.validSince = estStart;
      }

      if (estEnd) {
        pit.validUntil = estEnd;
      }

      data.push({
        type: 'pit',
        obj: pit
      });

      var broaderPreferred = getElementTagAttribute(element, 'gvp:broaderPreferred', 'rdf:resource');
      if (broaderPreferred) {
        // This implies that current PIT lies in broaderPreferred
        // Add liesIn relation
        data.push({
          type: 'relation',
          obj: {
            from: uri,
            to: broaderPreferred,
            type: 'hg:liesIn'
          }
        });
      }

      var subject = getElementTagAttribute(element, 'rdf:subject', 'rdf:resource');
      if (subject) {
        // This implies that subject is an alternative name for current PIT
        // Add sameHgConcept relation
        data.push({
          type: 'relation',
          obj: {
            from: uri,
            to: subject,
            type: 'hg:sameHgConcept'
          }
        });
      }

      writer.writeObjects(data, function(err) {
        callback(err);
      });
    } else {
      setImmediate(callback);
    }
  }
}

// ==================================== API ====================================

module.exports.title = 'Getty Thesaurus of Geographic Names';
module.exports.url = 'http://www.getty.edu/research/tools/vocabularies/tgn/';

module.exports.steps = [
  download,
  convert
];
