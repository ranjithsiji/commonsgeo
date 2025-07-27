$(document).ready(function () {
            // Initialize loading elements
            const loadingBar = $('.loading-bar');
            const spinner = $('.spinner');

            function startLoading() {
                spinner.show();
                loadingBar.addClass('active');
            }

            function stopLoading() {
                spinner.hide();
                loadingBar.removeClass('active');
            }

            // Clear images function
            function clearImages() {
                $('#gallery').empty();
                $('#slideshow-container').empty();
                currentImages = [];
                if (splide) {
                    splide.destroy();
                    splide = null;
                }
            }

            // Clear images button
            $('#clear-images').click(clearImages);

            // Initialize tabs
            $('.tab').click(function () {
                $('.tab').removeClass('active');
                $(this).addClass('active');
                const tabId = $(this).data('tab');
                $('.tab-content').removeClass('active');
                $(`#${tabId}`).addClass('active');
            });

            // Initialize map
            const map = L.map('map').setView([0, 0], 2);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);

            let marker = L.marker([0, 0]).addTo(map);
            let currentImages = [];
            let splide = null;

            // Initialize Splide slideshow
            function initSlideshow() {
                if (splide) {
                    splide.destroy();
                }

                splide = new Splide('#slideshow', {
                    type: 'fade',
                    perPage: 1,
                    perMove: 1,
                    gap: '20px',
                    arrows: true,
                    rewind: true,
                    cover: true,
                    pagination: false,
                    pause: 'false',
                    height: '80vh'
                }).mount();
            }

            initSlideshow();

            // Get a random location from Wikidata on page load
            getRandomWikidataLocation();

            // Validate radius inputs
            $('input[type="number"][id$="radius"]').on('change input', function () {
                const radius = parseFloat($(this).val());
                const errorId = $(this).attr('id') + '-error';

                if (isNaN(radius)) {
                    $(`#${errorId}`).show();
                    return;
                }

                if (radius < 0.01 || radius > 10) {
                    $(`#${errorId}`).show();
                } else {
                    $(`#${errorId}`).hide();
                }
            });

            // Update coordinates when clicking on the map
            map.on('click', function (e) {
                const { lat, lng } = e.latlng;
                $('#latitude').val(lat.toFixed(6));
                $('#longitude').val(lng.toFixed(6));
                updateMarker(lat, lng);
                reverseGeocode(lat, lng);
                updateActiveTabInputs(lat, lng);
            });

            // Update marker position
            function updateMarker(lat, lng) {
                map.setView([lat, lng], 13);
                marker.setLatLng([lat, lng]);
            }

            // Update inputs in active tab
            function updateActiveTabInputs(lat, lng) {
                const activeTab = $('.tab.active').data('tab');

                if (activeTab === 'search') {
                    // Don't update search tab as it has its own location search
                    return;
                } else if (activeTab === 'location') {
                    $('#latitude').val(lat);
                    $('#longitude').val(lng);
                }
                // For random tab, we don't update the inputs as they're generated
            }

            // Get random location from Wikidata
            function getRandomWikidataLocation() {
                startLoading();
                clearImages();

                // Generate random offset (up to 1,000,000)
                const randomOffset = Math.floor(Math.random() * 1000000);

                const sparqlQuery = `
                    SELECT ?item ?itemLabel ?itemDescription ?lat ?lon ?photo WHERE { 
                        { 
                            SELECT ?item ?photo ?lat ?lon
                            WHERE { 
                                ?item wdt:P18 ?photo .  
                                ?item p:P625 ?statement . 
                                ?statement psv:P625 ?coords . 
                                ?coords wikibase:geoLatitude ?lat . 
                                ?coords wikibase:geoLongitude ?lon . 
                            } LIMIT 1 OFFSET ${randomOffset}
                        } 
                        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } 
                    }`;

                const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparqlQuery)}&format=json`;

                $.ajax({
                    url: url,
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    },
                    success: function (data) {
                        if (data.results.bindings.length > 0) {
                            const result = data.results.bindings[0];
                            const lat = parseFloat(result.lat.value);
                            const lon = parseFloat(result.lon.value);
                            const label = result.itemLabel.value;

                            $('#latitude').val(lat);
                            $('#longitude').val(lon);
                            $('#location-search').val(label);
                            updateMarker(lat, lon);

                            // Search for images at this location
                            const radius = $('#random-radius').val();
                            const limit = $('#random-limit').val();
                            fetchImages(lat, lon, radius, limit);
                        } else {
                            stopLoading();
                            alert('No random location found, using default');
                            updateMarker(40.7128, -74.0060);
                            $('#latitude').val(40.7128);
                            $('#longitude').val(-74.0060);
                            $('#location-search').val('New York City');
                        }
                    },
                    error: function () {
                        stopLoading();
                        alert('Error fetching random location from Wikidata');
                        updateMarker(40.7128, -74.0060);
                        $('#latitude').val(40.7128);
                        $('#longitude').val(-74.0060);
                        $('#location-search').val('New York City');
                    }
                });
            }

            // Random location button
            $('#random-location-btn').click(function () {
                getRandomWikidataLocation();
            });

            // Use current location
            $('#locate-btn').click(function () {
                if (navigator.geolocation) {
                    startLoading();
                    clearImages();
                    navigator.geolocation.getCurrentPosition(function (position) {
                        const lat = position.coords.latitude;
                        const lng = position.coords.longitude;
                        $('#latitude').val(lat);
                        $('#longitude').val(lng);
                        updateMarker(lat, lng);
                        reverseGeocode(lat, lng);
                        stopLoading();
                    }, function (error) {
                        stopLoading();
                        alert('Error getting location: ' + error.message);
                    });
                } else {
                    alert('Geolocation is not supported by your browser.');
                }
            });

            // Search for location using Nominatim
            $('#search-location-btn').click(searchLocation);
            $('#location-search').keypress(function (e) {
                if (e.which === 13) {
                    searchLocation();
                }
            });

            function searchLocation() {
                const query = $('#location-search').val().trim();
                if (!query) return;

                startLoading();
                $('#search-results').empty().hide();

                const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;

                $.ajax({
                    url: url,
                    method: 'GET',
                    dataType: 'json',
                    success: function (data) {
                        if (data && data.length > 0) {
                            displaySearchResults(data);
                        } else {
                            $('#search-results').html('<div class="search-result-item">No results found</div>').show();
                        }
                    },
                    error: function () {
                        alert('Error searching for location');
                    },
                    complete: function () {
                        stopLoading();
                    }
                });
            }

            function displaySearchResults(results) {
                const resultsContainer = $('#search-results');
                resultsContainer.empty();

                results.forEach(result => {
                    const item = $(`
                        <div class="search-result-item" data-lat="${result.lat}" data-lon="${result.lon}">
                            <strong>${result.display_name}</strong>
                            <div style="font-size: 0.8em; color: #666;">
                                Type: ${result.type} | Lat: ${result.lat}, Lon: ${result.lon}
                            </div>
                        </div>
                    `);

                    item.click(function () {
                        const lat = parseFloat($(this).data('lat'));
                        const lon = parseFloat($(this).data('lon'));
                        $('#latitude').val(lat);
                        $('#longitude').val(lon);
                        $('#location-search').val(result.display_name);
                        resultsContainer.hide();
                        updateMarker(lat, lon);
                    });

                    resultsContainer.append(item);
                });

                resultsContainer.show();
            }

            // Reverse geocode to get location name
            function reverseGeocode(lat, lng) {
                const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;

                $.getJSON(url, function (data) {
                    if (data.display_name) {
                        $('#location-search').val(data.display_name);
                    }
                });
            }

            // Search for images from search tab
            $('#search-btn').click(function () {
                const lat = $('#latitude').val();
                const lng = $('#longitude').val();
                let radius = parseFloat($('#search-radius').val());
                const limit = $('#search-limit').val();

                if (!lat || !lng) {
                    alert('Please search for a location first');
                    return;
                }

                // Validate and adjust radius if needed
                if (isNaN(radius)) {
                    $('#search-radius-error').show();
                    return;
                }

                if (radius < 0.01) {
                    radius = 0.01;
                    $('#search-radius').val(0.01);
                } else if (radius > 10) {
                    radius = 10;
                    $('#search-radius').val(10);
                }

                startLoading();
                clearImages();
                updateMarker(parseFloat(lat), parseFloat(lng));
                fetchImages(lat, lng, radius, limit);
            });

            // Search for images from location tab
            $('#location-search-btn').click(function () {
                const lat = $('#latitude').val();
                const lng = $('#longitude').val();
                let radius = parseFloat($('#location-radius').val());
                const limit = $('#location-limit').val();

                if (!lat || !lng) {
                    alert('Please enter latitude and longitude');
                    return;
                }

                // Validate and adjust radius if needed
                if (isNaN(radius)) {
                    $('#location-radius-error').show();
                    return;
                }

                if (radius < 0.01) {
                    radius = 0.01;
                    $('#location-radius').val(0.01);
                } else if (radius > 10) {
                    radius = 10;
                    $('#location-radius').val(10);
                }

                startLoading();
                clearImages();
                updateMarker(parseFloat(lat), parseFloat(lng));
                fetchImages(lat, lng, radius, limit);
            });

            // Fetch images from Wikimedia Commons API
            function fetchImages(lat, lng, radius, limit) {
                // Convert km to meters for the API
                const radiusMeters = Math.round(radius * 1000);
                const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=geosearch&ggsprimary=all&ggsnamespace=6&ggsradius=${radiusMeters}&ggscoord=${lat}|${lng}&ggslimit=${limit}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=500&origin=*`;

                $.getJSON(url, function (data) {
                    currentImages = [];

                    if (data.query && data.query.pages) {
                        const pages = data.query.pages;

                        for (const pageId in pages) {
                            const page = pages[pageId];
                            if (page.imageinfo && page.imageinfo[0]) {
                                const imageInfo = page.imageinfo[0];
                                const metadata = imageInfo.extmetadata || {};

                                currentImages.push({
                                    url: imageInfo.url,
                                    fileinfourl: imageInfo.descriptionurl,
                                    thumbUrl: imageInfo.thumburl || imageInfo.url,
                                    title: page.title.replace('File:', ''),
                                    description: metadata.ImageDescription ? metadata.ImageDescription.value : '',
                                    artist: metadata.Artist ? metadata.Artist.value : 'Unknown',
                                    license: metadata.LicenseShortName ? metadata.LicenseShortName.value : ''
                                });
                            }
                        }

                        if (currentImages.length > 0) {
                            displayGallery();
                            initSlideshow();
                            $('#show-gallery').click();

                            // Scroll to images
                            $('html, body').animate({
                                scrollTop: $('#gallery').offset().top - 20
                            }, 500);
                        } else {
                            $('#gallery').html('<div class="no-results"><p>No images found in this area. Try increasing the radius.</p></div>');
                        }
                    } else {
                        $('#gallery').html('<div class="no-results"><p>No images found in this area. Try increasing the radius.</p></div>');
                    }
                }).fail(function () {
                    alert('Error fetching images from Wikimedia Commons');
                }).always(function () {
                    stopLoading();
                });
            }

            // Display images in gallery view
            function displayGallery() {
                $('#gallery').empty();

                currentImages.forEach(function (image) {
                    const imgElement = $(`
                        <div class="gallery-item">
                            <img src="${image.thumbUrl}" alt="${image.title}">
                            <div class="gallery-info">
                                <h3 title="${image.title}"><a href="${image.fileinfourl}" target="_blank">${image.title}</a></h3>
                                <p>${image.artist} • ${image.license}</p>
                            </div>
                        </div>
                    `);

                    $('#gallery').append(imgElement);
                });

                // Prepare slideshow
                $('#slideshow-container').empty();
                currentImages.forEach(function (image) {
                    const slide = $(`
                        <li class="splide__slide">
                            <img src="${image.url}" alt="${image.title}">
                            <div class="splide__caption">
                                <h3><a href="${image.fileinfourl}" target="_blank">${image.title}</a></h3>
                                <p>${image.description}</p>
                                <p><strong>Artist:</strong> ${image.artist}</p>
                                <p><strong>License:</strong> ${image.license}</p>
                            </div>
                        </li>
                    `);
                    $('#slideshow-container').append(slide);
                });
            }

            // Show gallery view
            $('#show-gallery').click(function () {
                $('#gallery').show();
                $('#slideshow').hide();
                $(this).css('background-color', '#004488');
                $('#show-slideshow').css('background-color', '#0066cc');
            });

            // Show slideshow view
            $('#show-slideshow').click(function () {
                if (currentImages.length === 0) {
                    alert('No images to display in slideshow');
                    return;
                }

                $('#gallery').hide();
                $('#slideshow').show();
                $(this).css('background-color', '#004488');
                $('#show-gallery').css('background-color', '#0066cc');

                // Refresh slideshow to account for new images
                if (splide) {
                    splide.refresh();
                }
            });
        });